import { openai } from '@ai-sdk/openai';
import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  toUIMessageStream,
  isTextUIPart,
  type UIMessage,
} from 'ai';
import { classifyIntent } from '@/lib/router';
import { productSearch } from '@/lib/tools/product-search';
import { extractFilters } from '@/lib/tools/extract-filters';
import { stockCheck } from '@/lib/tools/stock-check';
import { howToRag } from '@/lib/tools/how-to-rag';
import { checkSafetyEscalation } from '@/lib/tools/safety-escalate';
import { buildKit, detectProject, isExteriorProject } from '@/lib/tools/project-kit';
import { createTracer } from '@/lib/trace';
import type { ProductFilters, ProductCardData } from '@/lib/types';

export const runtime = 'nodejs';

const GENERATOR_MODEL = 'gpt-4o';

export type CharlieUIMessage = UIMessage<
  unknown,
  {
    status: { label: string; stage: string };
    products: ProductCardData;
  }
>;

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = performance.now();
  const value = await fn();
  return { value, ms: Math.round(performance.now() - start) };
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const tracer = createTracer();
  const requestStart = performance.now();

  const lastUserMessage = messages.findLast((m) => m.role === 'user');
  const lastUserText =
    lastUserMessage?.parts
      .filter(isTextUIPart)
      .map((p) => p.text)
      .join('') ?? '';

  tracer.log({
    event: 'request_start',
    stage: 'request',
    data: { user_message: lastUserText, message_count: messages.length },
  });

  const uiStream = createUIMessageStream<CharlieUIMessage>({
    execute: async ({ writer }) => {
      const emitStatus = (label: string, stage: string) => {
        writer.write({
          type: 'data-status',
          data: { label, stage },
          transient: true,
        });
      };

      // Persistent (non-transient) so the cards stay attached to this assistant
      // message in the client's `parts` array after streaming ends.
      const emitProducts = (data: ProductCardData) => {
        writer.write({ type: 'data-products', data });
      };

      // Helper closed over tracer + requestStart. Defining it here so onFinish
      // can log request_end with the full path taken and total token roll-up.
      const runGenerator = (
        stage: string,
        args:
          | { system: string; prompt: string }
          | { system: string; messages: Awaited<ReturnType<typeof convertToModelMessages>> },
        path: string,
      ) => {
        const start = performance.now();
        const onFinish = ({
          text,
          usage,
          finishReason,
        }: {
          text: string;
          usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
          finishReason: string;
        }) => {
          const ms = Math.round(performance.now() - start);
          const u = {
            input_tokens: usage?.inputTokens,
            output_tokens: usage?.outputTokens,
            total_tokens: usage?.totalTokens,
          };
          tracer.addUsage(u);
          tracer.log({
            event: 'llm_call',
            stage,
            ms,
            model: GENERATOR_MODEL,
            prompt: { system: args.system, user: 'prompt' in args ? args.prompt : undefined },
            response: { text, finish_reason: finishReason },
            usage: u,
          });
          tracer.log({
            event: 'request_end',
            stage: 'request',
            ms: Math.round(performance.now() - requestStart),
            data: { path, usage_total: tracer.totalUsage() },
          });
        };

        const result =
          'prompt' in args
            ? streamText({
                model: openai(GENERATOR_MODEL),
                system: args.system,
                prompt: args.prompt,
                onFinish,
              })
            : streamText({
                model: openai(GENERATOR_MODEL),
                system: args.system,
                messages: args.messages,
                onFinish,
              });

        // sendStart: false — this execute owns the message framing (we emit the
        // single `start` below). Without this the generator's own `start` lands
        // AFTER our data-products part, and the client drops any part written
        // before `start`, so the product cards never render.
        writer.merge(toUIMessageStream({ stream: result.stream, sendStart: false }));
      };

      // Open the assistant message up front so every subsequent part (status,
      // product cards, then the streamed text) is accumulated into it. Parts
      // written before `start` are discarded by the client.
      writer.write({ type: 'start' });

      // 1. Rule-based safety FIRST. Deterministic liability boundary — the LLM
      //    is never the sole arbiter of a refusal (SPEC key decision #4).
      const ruleRefusal = checkSafetyEscalation(lastUserText);
      if (ruleRefusal) {
        tracer.log({
          event: 'safety_rule_match',
          stage: 'safety_rule',
          data: { trade: ruleRefusal.trade, message: ruleRefusal.message },
        });
        emitStatus('Preparing a safety response', 'safety_refused');
        runGenerator(
          'generator_safety_refused',
          {
            system: 'Deliver the following message to the customer exactly as given.',
            prompt: ruleRefusal.message,
          },
          'safety_rule_refused',
        );
        return;
      }

      // 2. Router + extractor in parallel. Extractor is speculative — only used
      //    if the router lands on PRODUCT_SEARCH. Cheap gpt-4o-mini; the latency
      //    win outweighs the wasted call on non-search turns.
      emitStatus('Understanding your request', 'router');
      const [routerRes, filtersRes] = await Promise.all([
        timed(() => classifyIntent(lastUserText, tracer)),
        timed(() =>
          extractFilters(lastUserText, tracer).catch((err) => {
            tracer.log({
              event: 'error',
              stage: 'extractor',
              error: String(err),
            });
            const fallback: ProductFilters = { query: lastUserText };
            return fallback;
          }),
        ),
      ]);
      const { intent, confidence } = routerRes.value;
      const filters = filtersRes.value;

      // 3. Low-confidence → force CLARIFY. The router can be uncertain; treat
      //    that as a signal to ask, not to guess.
      const effectiveIntent = confidence === 'low' ? 'CLARIFY' : intent;
      tracer.log({
        event: 'router_decision',
        stage: 'router',
        data: {
          intent,
          confidence,
          effective_intent: effectiveIntent,
          ms_router: routerRes.ms,
          ms_extractor: filtersRes.ms,
        },
      });

      if (effectiveIntent === 'OFF_TOPIC') {
        emitStatus('Preparing a response', 'off_topic');
        runGenerator(
          'generator_off_topic',
          {
            system: 'Deliver the following message to the customer exactly as given.',
            prompt:
              "I'm here to help with your shopping needs. What can I help you look for today?",
          },
          'off_topic',
        );
        return;
      }

      // A router-classified SAFETY_ESCALATE that the rules didn't already catch
      // is a soft-refusal path — generic message, no product context.
      if (effectiveIntent === 'SAFETY_ESCALATE') {
        tracer.log({
          event: 'router_decision',
          stage: 'safety_router_only',
          data: { note: 'router flagged safety but no rule matched' },
        });
        emitStatus('Preparing a safety response', 'safety_router_refused');
        runGenerator(
          'generator_safety_router',
          {
            system: 'Deliver the following message to the customer exactly as given.',
            prompt:
              'That work should be handled by a licensed trade. I can help you source materials once a professional has assessed the job.',
          },
          'safety_router_refused',
        );
        return;
      }

      let toolContext = '';
      let resultCount = 0;

      if (effectiveIntent === 'PRODUCT_SEARCH') {
        emitStatus('Searching the catalog', 'product_search');
        const search = await timed(() => productSearch({ ...filters, limit: 5 }));
        resultCount = search.value.length;
        if (resultCount > 0) emitProducts({ kind: 'search', products: search.value });
        toolContext = `Applied filters:\n${JSON.stringify(filters, null, 2)}\n\nProduct search results (${resultCount}):\n${JSON.stringify(search.value, null, 2)}`;
        tracer.log({
          event: 'tool_call',
          stage: 'product_search',
          ms: search.ms,
          data: {
            filters,
            result_count: resultCount,
            result_ids: search.value.map((p) => p.id),
          },
        });
      } else if (effectiveIntent === 'PROJECT_KIT') {
        // Whole-project bundle. Project (painting/garden/bathroom) is inferred
        // from the query; budget comes from the extractor's price_max; painting
        // also picks interior vs exterior. Cards render the kit; the generator
        // writes the walkthrough from the same data.
        emitStatus('Putting together your kit', 'project_kit');
        const project = detectProject(lastUserText) ?? 'painting';
        const exterior = project === 'painting' && isExteriorProject(lastUserText);
        const kitRes = await timed(() =>
          buildKit({
            project,
            budget: filters.price_max ?? null,
            exterior,
            brand: filters.brand,
          }),
        );
        const kit = kitRes.value;
        resultCount = kit.items.length;
        emitProducts({ kind: 'kit', kit });
        const kind = project === 'painting' ? `painting, ${exterior ? 'exterior' : 'interior'}` : project;
        toolContext = `Project kit (${kind}):\n${JSON.stringify(kit, null, 2)}`;
        tracer.log({
          event: 'tool_call',
          stage: 'project_kit',
          ms: kitRes.ms,
          data: {
            project,
            exterior,
            budget: kit.budget,
            total: kit.total,
            within_budget: kit.within_budget,
            item_ids: kit.items.map((it) => it.product.id),
            skipped: kit.skipped.map((s) => s.label),
          },
        });
      } else if (effectiveIntent === 'STOCK_CHECK') {
        // Resolve product ID from the query via the same filter path — top-1
        // rated match wins. If nothing matches, tell the user we couldn't
        // identify the product rather than answering about a random SKU.
        emitStatus('Finding the product', 'stock_check_resolve');
        const resolve = await timed(() => productSearch({ ...filters, limit: 1 }));
        if (resolve.value.length === 0) {
          tracer.log({
            event: 'tool_call',
            stage: 'stock_check',
            ms: resolve.ms,
            data: { filters, resolved: null, note: 'no product matched' },
          });
          toolContext = `We could not identify which product the customer is asking about. Ask them to specify the product by name, brand, or SKU.`;
        } else {
          const target = resolve.value[0];
          emitStatus(`Checking stock for ${target.name}`, 'stock_check_lookup');
          const stock = await timed(() => stockCheck(target.id));
          toolContext = `Product identified: ${target.name} (${target.id}).\n\nStock:\n${JSON.stringify(stock.value, null, 2)}`;
          tracer.log({
            event: 'tool_call',
            stage: 'stock_check',
            ms: resolve.ms + stock.ms,
            data: {
              filters,
              resolved: { id: target.id, name: target.name },
              stock: stock.value,
              ms_resolve: resolve.ms,
              ms_stock: stock.ms,
            },
          });
        }
      } else if (effectiveIntent === 'HOW_TO') {
        emitStatus('Reading the guides', 'how_to');
        const rag = await timed(() => howToRag(lastUserText, undefined, tracer));
        toolContext = rag.value.sources.map((s) => `[${s.title}]\n${s.chunk}`).join('\n\n');
        tracer.log({
          event: 'tool_call',
          stage: 'how_to_rag',
          ms: rag.ms,
          data: { source_count: rag.value.sources.length },
        });
      }

      emitStatus('Writing your answer', 'generator');
      const systemPrompt = buildSystemPrompt(effectiveIntent, toolContext, resultCount);
      const modelMessages = await convertToModelMessages(messages);
      runGenerator(
        'generator',
        { system: systemPrompt, messages: modelMessages },
        `generator:${effectiveIntent.toLowerCase()}`,
      );
    },
  });

  return createUIMessageStreamResponse({
    stream: uiStream,
    headers: { 'x-trace-id': tracer.traceId },
  });
}

function buildSystemPrompt(intent: string, toolContext: string, resultCount: number): string {
  const base =
    'You are a helpful hardware and home-improvement store assistant. Be concise and practical.';

  if (intent === 'PRODUCT_SEARCH' && toolContext) {
    if (resultCount === 0) {
      return `${base}\n\nNo products matched the customer's criteria. Explain briefly what was searched (from the applied filters below) and ask a targeted question to broaden the search (e.g. drop a constraint or try a different brand). Do not invent products.\n\n${toolContext}`;
    }
    return `${base}\n\nThe following products match the customer's query AND are already shown to them as product cards (name, price, rating, specs, stock all visible). Do NOT re-list the products or their prices/specs as bullets — that duplicates the cards. Instead write 2-3 sentences of prose: what stands out, how to choose between them, or a top pick and why. Only reference products from this list — do not invent products.\n\n${toolContext}`;
  }
  if (intent === 'PROJECT_KIT' && toolContext) {
    return `${base}\n\nThe customer wants everything for a home project (the kit's "project" field says which — painting, garden, or bathroom). A kit has been assembled from the catalog below and is ALREADY shown to them as product cards — every item name, price, rating and spec is visible in the cards. Do NOT re-list the items or their prices/specs as a numbered or bulleted list; that just duplicates the cards. Write a short, friendly walkthrough in 2-4 sentences of prose: what the kit covers as a whole, the running total vs their budget, and — if within_budget is false or items were skipped — say so plainly and suggest one next step (raise budget, smaller scope, or which item to add back). Only reference products in this kit; do not invent products.\n\n${toolContext}`;
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