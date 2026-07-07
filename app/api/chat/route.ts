import { openai } from '@ai-sdk/openai';
import {
  streamText,
  convertToModelMessages,
  isTextUIPart,
  type UIMessage,
} from 'ai';
import { classifyIntent } from '@/lib/router';
import { productSearch } from '@/lib/tools/product-search';
import { extractFilters } from '@/lib/tools/extract-filters';
import { stockCheck } from '@/lib/tools/stock-check';
import { howToRag } from '@/lib/tools/how-to-rag';
import { checkSafetyEscalation } from '@/lib/tools/safety-escalate';
import type { ProductFilters } from '@/lib/types';

export const runtime = 'nodejs';

type Stage = 'safety_rule' | 'router' | 'extractor' | 'search' | 'resolve_product' | 'stock' | 'rag';

function log(event: string, data: Record<string, unknown>) {
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), event, ...data }),
  );
}

async function timed<T>(stage: Stage, fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = performance.now();
  const value = await fn();
  return { value, ms: Math.round(performance.now() - start) };
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const lastUserMessage = messages.findLast((m) => m.role === 'user');
  const lastUserText =
    lastUserMessage?.parts
      .filter(isTextUIPart)
      .map((p) => p.text)
      .join('') ?? '';

  // 1. Rule-based safety FIRST. Deterministic liability boundary — the LLM
  //    is never the sole arbiter of a refusal (SPEC key decision #4).
  const ruleRefusal = checkSafetyEscalation(lastUserText);
  if (ruleRefusal) {
    log('safety_refused', { trade: ruleRefusal.trade });
    const result = streamText({
      model: openai('gpt-4o'),
      system: 'Deliver the following message to the customer exactly as given.',
      prompt: ruleRefusal.message,
    });
    return result.toUIMessageStreamResponse();
  }

  // 2. Router + extractor in parallel. Extractor is speculative — only used
  //    if the router lands on PRODUCT_SEARCH. Cheap gpt-4o-mini; the latency
  //    win outweighs the wasted call on non-search turns.
  const [routerRes, filtersRes] = await Promise.all([
    timed('router', () => classifyIntent(lastUserText)),
    timed('extractor', () =>
      extractFilters(lastUserText).catch((err) => {
        log('extractor_failed', { error: String(err) });
        return { query: lastUserText } satisfies ProductFilters;
      }),
    ),
  ]);
  const { intent, confidence } = routerRes.value;
  const filters = filtersRes.value;

  // 3. Low-confidence → force CLARIFY. The router can be uncertain; treat
  //    that as a signal to ask, not to guess.
  const effectiveIntent = confidence === 'low' ? 'CLARIFY' : intent;
  log('routed', {
    intent,
    confidence,
    effectiveIntent,
    ms_router: routerRes.ms,
    ms_extractor: filtersRes.ms,
  });

  if (effectiveIntent === 'OFF_TOPIC') {
    const result = streamText({
      model: openai('gpt-4o'),
      system: 'Deliver the following message to the customer exactly as given.',
      prompt:
        "I'm here to help with your shopping needs. What can I help you look for today?",
    });
    return result.toUIMessageStreamResponse();
  }

  // A router-classified SAFETY_ESCALATE that the rules didn't already catch
  // is a soft-refusal path — generic message, no product context.
  if (effectiveIntent === 'SAFETY_ESCALATE') {
    log('safety_router_only', {});
    const result = streamText({
      model: openai('gpt-4o'),
      system: 'Deliver the following message to the customer exactly as given.',
      prompt:
        "That work should be handled by a licensed trade. I can help you source materials once a professional has assessed the job.",
    });
    return result.toUIMessageStreamResponse();
  }

  let toolContext = '';
  let resultCount = 0;

  if (effectiveIntent === 'PRODUCT_SEARCH') {
    const search = await timed('search', () => productSearch({ ...filters, limit: 5 }));
    resultCount = search.value.length;
    toolContext = `Applied filters:\n${JSON.stringify(filters, null, 2)}\n\nProduct search results (${resultCount}):\n${JSON.stringify(search.value, null, 2)}`;
    log('product_search', { filters, resultCount, ms: search.ms });
  } else if (effectiveIntent === 'STOCK_CHECK') {
    // Resolve product ID from the query via the same filter path — top-1
    // rated match wins. If nothing matches, tell the user we couldn't
    // identify the product rather than answering about a random SKU.
    const resolve = await timed('resolve_product', () =>
      productSearch({ ...filters, limit: 1 }),
    );
    if (resolve.value.length === 0) {
      log('stock_no_match', { filters });
      toolContext = `We could not identify which product the customer is asking about. Ask them to specify the product by name, brand, or SKU.`;
    } else {
      const target = resolve.value[0];
      const stock = await timed('stock', () => stockCheck(target.id));
      toolContext = `Product identified: ${target.name} (${target.id}).\n\nStock:\n${JSON.stringify(stock.value, null, 2)}`;
      log('stock_check', { product_id: target.id, ms_resolve: resolve.ms, ms_stock: stock.ms });
    }
  } else if (effectiveIntent === 'HOW_TO') {
    const rag = await timed('rag', () => howToRag(lastUserText));
    toolContext = rag.value.sources.map((s) => `[${s.title}]\n${s.chunk}`).join('\n\n');
    log('how_to', { ms: rag.ms, sources: rag.value.sources.length });
  }

  const systemPrompt = buildSystemPrompt(effectiveIntent, toolContext, resultCount);
  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: openai('gpt-4o'),
    system: systemPrompt,
    messages: modelMessages,
  });

  return result.toUIMessageStreamResponse();
}

function buildSystemPrompt(intent: string, toolContext: string, resultCount: number): string {
  const base =
    'You are a helpful hardware and home-improvement store assistant. Be concise and practical.';

  if (intent === 'PRODUCT_SEARCH' && toolContext) {
    if (resultCount === 0) {
      return `${base}\n\nNo products matched the customer's criteria. Explain briefly what was searched (from the applied filters below) and ask a targeted question to broaden the search (e.g. drop a constraint or try a different brand). Do not invent products.\n\n${toolContext}`;
    }
    return `${base}\n\nThe following products match the customer's query. Present the options clearly, highlighting key specs and price. Only mention products from this list — do not invent products.\n\n${toolContext}`;
  }
  if (intent === 'HOW_TO' && toolContext) {
    return `${base}\n\nAnswer based only on the following guide excerpts. If the excerpts don't cover the question, say so.\n\n${toolContext}`;
  }
  if (intent === 'STOCK_CHECK' && toolContext) {
    return `${base}\n\nUse the following stock data to answer the customer's availability question. If no product was identified, ask the customer to clarify which item.\n\n${toolContext}`;
  }
  if (intent === 'CLARIFY') {
    return `${base}\n\nThe customer's request is ambiguous. Ask one focused clarifying question to determine whether they need product recommendations, how-to guidance, or a stock check.`;
  }
  return base;
}
