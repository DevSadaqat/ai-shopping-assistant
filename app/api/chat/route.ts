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
import { extractFilters } from '@/lib/tools/extract-filters';
import { howToRag } from '@/lib/tools/how-to-rag';
import { planTurn, type ModelTier } from '@/lib/turn';
import { after } from 'next/server';
import { createTracer, flushTraces } from '@/lib/trace';
import type { ProductCardData } from '@/lib/types';

export const runtime = 'nodejs';

// Premium model for substantive answers (product prose, kit walkthroughs, RAG);
// lighter/cheaper model for low-value generation — a single clarifying question
// or a "broaden your search" nudge doesn't warrant the premium model. Matching
// model to task keeps simple turns fast and cheap (see Effective AI Agents,
// "choose the right model for the job"). The turn decides the tier; this is
// the only place that knows which model each tier means.
const GENERATOR_MODELS: Record<ModelTier, string> = {
  premium: 'gpt-4o',
  light: 'gpt-4o-mini',
};

export type CharlieUIMessage = UIMessage<
  unknown,
  {
    status: { label: string; stage: string };
    products: ProductCardData;
  }
>;

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

  const logRequestEnd = (path: string) => {
    tracer.log({
      event: 'request_end',
      stage: 'request',
      ms: Math.round(performance.now() - requestStart),
      data: { path, usage_total: tracer.totalUsage() },
    });
  };

  const uiStream = createUIMessageStream<CharlieUIMessage>({
    execute: async ({ writer }) => {
      // Open the assistant message up front so every subsequent part (status,
      // the streamed text, then product cards) is accumulated into it. Parts
      // written before `start` are discarded by the client.
      writer.write({ type: 'start' });

      const plan = await planTurn(lastUserText, {
        classifyIntent: (text) => classifyIntent(text, tracer),
        extractFilters: (text) => extractFilters(text, tracer),
        retrieveGuides: (query) => howToRag(query, undefined, tracer),
        tracer,
        onProgress: (label, stage) => {
          writer.write({ type: 'data-status', data: { label, stage }, transient: true });
        },
      });

      if (plan.kind === 'fixed') {
        // Stream the fixed text WITHOUT a model call. Used for deterministic
        // paths (safety refusal, off-topic) where routing the exact wording
        // through an LLM is both wasteful and unsafe — the model can
        // editorialize or refuse to echo it, which would put the final words
        // back in the model's hands.
        writer.write({ type: 'text-start', id: 't0' });
        writer.write({ type: 'text-delta', id: 't0', delta: plan.text });
        writer.write({ type: 'text-end', id: 't0' });
        logRequestEnd(plan.path);
        return;
      }

      const model = GENERATOR_MODELS[plan.tier];
      const start = performance.now();
      const result = streamText({
        model: openai(model),
        system: plan.system,
        messages: await convertToModelMessages(messages),
        onFinish: ({ text, usage, finishReason }) => {
          const u = {
            input_tokens: usage?.inputTokens,
            output_tokens: usage?.outputTokens,
            total_tokens: usage?.totalTokens,
          };
          tracer.addUsage(u);
          tracer.log({
            event: 'llm_call',
            stage: 'generator',
            ms: Math.round(performance.now() - start),
            model,
            prompt: { system: plan.system },
            response: { text, finish_reason: finishReason },
            usage: u,
          });
          logRequestEnd(plan.path);
        },
      });

      // sendStart: false — this execute owns the message framing (we emit the
      // single `start` above). Without this the generator's own `start` lands
      // AFTER our data-products part, and the client drops any part written
      // before `start`, so the product cards never render.
      //
      // Pump the generator's UI parts to the client manually (rather than
      // fire-and-forget `writer.merge`) so we have a completion point: once
      // the text has fully streamed we attach the product cards. This
      // guarantees text-first, cards-after ordering.
      const genStream = toUIMessageStream({ stream: result.stream, sendStart: false });
      const reader = genStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // The generator stream is typed as a generic UIMessage chunk; it
          // carries only text parts here, which are valid for CharlieUIMessage.
          writer.write(value as Parameters<typeof writer.write>[0]);
        }
      } finally {
        reader.releaseLock();
      }

      // Persistent (non-transient) so the cards stay attached to this
      // assistant message in the client's `parts` array after streaming ends.
      if (plan.cards) writer.write({ type: 'data-products', data: plan.cards });
    },
  });

  // Flush queued Langfuse events AFTER the response is sent. On Vercel `after`
  // runs via waitUntil, so the post-response flush never adds latency to the
  // streamed answer the user is reading.
  after(flushTraces);

  return createUIMessageStreamResponse({
    stream: uiStream,
    headers: { 'x-trace-id': tracer.traceId },
  });
}
