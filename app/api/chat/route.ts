import { openai } from '@ai-sdk/openai';
import {
  streamText,
  convertToModelMessages,
  isTextUIPart,
  type UIMessage,
} from 'ai';
import { classifyIntent } from '@/lib/router';
import { productSearch } from '@/lib/tools/product-search';
import { stockCheck } from '@/lib/tools/stock-check';
import { howToRag } from '@/lib/tools/how-to-rag';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const lastUserMessage = messages.findLast((m) => m.role === 'user');
  const lastUserText =
    lastUserMessage?.parts
      .filter(isTextUIPart)
      .map((p) => p.text)
      .join('') ?? '';

  const { intent } = await classifyIntent(lastUserText);

  if (intent === 'OFF_TOPIC') {
    const result = streamText({
      model: openai('gpt-4o'),
      system: 'Deliver the following message to the customer exactly as given.',
      prompt:
        "I'm here to help with your shopping needs. What can I help you look for today?",
    });
    return result.toUIMessageStreamResponse();
  }

  if (intent === 'SAFETY_ESCALATE') {
    const result = streamText({
      model: openai('gpt-4o'),
      system: 'Deliver the following message to the customer exactly as given.',
      prompt:
        "I can't assist with that. I am concerned for your safety, but as an AI assistant, I am not equipped to provide the support you need. Please reach out to a trusted person or professional for help.",
    });
    return result.toUIMessageStreamResponse();
  }

  let toolContext = '';

  if (intent === 'PRODUCT_SEARCH') {
    const products = await productSearch({ query: lastUserText, limit: 5 });
    toolContext = `Product search results:\n${JSON.stringify(products, null, 2)}`;
  } else if (intent === 'STOCK_CHECK') {
    const stockResult = await stockCheck('prod-042');
    toolContext = `Stock check result:\n${JSON.stringify(stockResult, null, 2)}`;
  } else if (intent === 'HOW_TO') {
    const ragResult = await howToRag(lastUserText);
    toolContext = ragResult.sources
      .map((s) => `[${s.title}]\n${s.chunk}`)
      .join('\n\n');
  }

  const systemPrompt = buildSystemPrompt(intent, toolContext);
  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: openai('gpt-4o'),
    system: systemPrompt,
    messages: modelMessages,
  });

  return result.toUIMessageStreamResponse();
}

function buildSystemPrompt(intent: string, toolContext: string): string {
  const base =
    'You are a helpful hardware and home-improvement store assistant. Be concise and practical.';

  if (intent === 'PRODUCT_SEARCH' && toolContext) {
    return `${base}\n\nThe following products match the customer's query. Present the options clearly, highlighting key specs and price. Only mention products from this list — do not invent products.\n\n${toolContext}`;
  }
  if (intent === 'HOW_TO' && toolContext) {
    return `${base}\n\nAnswer based only on the following guide excerpts. If the excerpts don't cover the question, say so.\n\n${toolContext}`;
  }
  if (intent === 'STOCK_CHECK' && toolContext) {
    return `${base}\n\nUse the following stock data to answer the customer's availability question.\n\n${toolContext}`;
  }
  if (intent === 'CLARIFY') {
    return `${base}\n\nThe customer's request is ambiguous. Ask one focused clarifying question to determine whether they need product recommendations, how-to guidance, or a stock check.`;
  }
  return base;
}
