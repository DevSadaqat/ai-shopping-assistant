import { appendFileSync, existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { randomBytes } from "node:crypto"
import { Langfuse, type LangfuseTraceClient } from "langfuse"

export type TraceEvent =
  | "request_start"
  | "request_end"
  | "llm_call"
  | "tool_call"
  | "retrieval"
  | "router_decision"
  | "safety_rule_match"
  | "error"

export type LLMUsage = {
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
}

export type TraceRecord = {
  ts: string
  trace_id: string
  span_id: string
  parent_span_id?: string
  event: TraceEvent
  stage: string
  ms?: number
  model?: string
  prompt?: { system?: string; user?: string; messages?: unknown }
  response?: { text?: string; structured?: unknown; finish_reason?: string }
  usage?: LLMUsage
  data?: Record<string, unknown>
  error?: string
}

const TRACE_DIR = join(process.cwd(), ".traces")
let dirEnsured = false
let dirWritable = true
function ensureDir() {
  if (dirEnsured) return
  try {
    if (!existsSync(TRACE_DIR)) mkdirSync(TRACE_DIR, { recursive: true })
  } catch {
    // Read-only FS (e.g. Vercel serverless). Traces are best-effort; disable file writes.
    dirWritable = false
  }
  dirEnsured = true
}

function shortId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`
}

export function newTraceId(): string {
  return shortId("trc")
}

// --- Langfuse sink -----------------------------------------------------------
// A single process-wide client is shared across requests. Events are queued
// in-memory and flushed in batches over HTTP by a background worker, so calls
// here never block the request path. On serverless the caller must await
// `flushTraces()` (via Next's `after()`) before the function freezes, or queued
// events are lost. The client only comes to life when both keys are present, so
// local dev without keys keeps working and falls back to the JSONL file below.
let langfuseSingleton: Langfuse | null | undefined
function getLangfuse(): Langfuse | null {
  if (langfuseSingleton !== undefined) return langfuseSingleton
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY
  const secretKey = process.env.LANGFUSE_SECRET_KEY
  if (!publicKey || !secretKey) {
    langfuseSingleton = null
    return null
  }
  langfuseSingleton = new Langfuse({
    publicKey,
    secretKey,
    // Defaults to Langfuse Cloud (https://cloud.langfuse.com). Set for EU/US
    // region or self-hosted instances.
    baseUrl: process.env.LANGFUSE_BASEURL,
  })
  return langfuseSingleton
}

/**
 * Flush all queued Langfuse events. Call (and await) this AFTER the response
 * has been sent — on Vercel, wrap it in `after()` from `next/server` so it runs
 * post-response without adding latency to the user-perceived stream. No-op when
 * Langfuse is not configured.
 */
export async function flushTraces(): Promise<void> {
  const lf = getLangfuse()
  if (!lf) return
  try {
    await lf.flushAsync()
  } catch {
    // best-effort — never let flushing break the request lifecycle
  }
}

function toOpenAIUsage(u?: LLMUsage) {
  if (!u) return undefined
  return {
    promptTokens: u.input_tokens,
    completionTokens: u.output_tokens,
    totalTokens: u.total_tokens,
  }
}

// Map one flat trace record onto the right Langfuse observation. `llm_call`
// becomes a generation (model + tokens + cost tracking); timed work becomes a
// span; instantaneous decisions become events; errors are flagged at ERROR
// level so they surface in the UI. Timestamps are back-dated from `ms` so the
// UI shows the real duration even though we log after the call completes.
function recordToLangfuse(trace: LangfuseTraceClient, rec: TraceRecord) {
  const now = Date.now()
  const startTime = rec.ms != null ? new Date(now - rec.ms) : new Date(now)
  const endTime = new Date(now)

  switch (rec.event) {
    case "llm_call":
      trace.generation({
        name: rec.stage,
        model: rec.model,
        startTime,
        endTime,
        completionStartTime: startTime,
        input: rec.prompt?.messages ?? {
          system: rec.prompt?.system,
          user: rec.prompt?.user,
        },
        output: rec.response?.text ?? rec.response?.structured,
        usage: toOpenAIUsage(rec.usage),
        metadata: { finish_reason: rec.response?.finish_reason, ...rec.data },
      })
      break

    case "request_start":
      // Trace-level input/name are already set at creation; nothing to add.
      break

    case "request_end":
      trace.update({ output: rec.data })
      break

    case "error":
      trace.event({
        name: rec.stage,
        startTime,
        level: "ERROR",
        statusMessage: rec.error,
        metadata: rec.data,
      })
      break

    case "tool_call":
    case "retrieval":
      // Timed work → span with real duration.
      trace
        .span({
          name: rec.stage,
          startTime,
          endTime,
          metadata: rec.data,
        })
        .end()
      break

    default:
      // router_decision, safety_rule_match, and anything new → point-in-time event.
      trace.event({
        name: rec.stage,
        startTime,
        metadata: rec.data,
      })
  }
}

export type Tracer = {
  traceId: string
  log: (rec: Omit<TraceRecord, "ts" | "trace_id" | "span_id"> & { span_id?: string }) => void
  wrapLLM: <T>(
    stage: string,
    prompt: { system?: string; user?: string; messages?: unknown },
    model: string,
    fn: () => Promise<{
      value: T
      text?: string
      structured?: unknown
      usage?: LLMUsage
      finishReason?: string
    }>,
  ) => Promise<T>
  addUsage: (u: LLMUsage) => void
  totalUsage: () => LLMUsage
}

export function createTracer(traceId: string = newTraceId()): Tracer {
  ensureDir()
  const filePath = join(TRACE_DIR, `${traceId}.jsonl`)
  const usageTotal: Required<LLMUsage> = { input_tokens: 0, output_tokens: 0, total_tokens: 0 }

  // Open a Langfuse trace for this request (no-op holder when unconfigured).
  const lf = getLangfuse()
  const lfTrace = lf ? lf.trace({ id: traceId, name: "chat_request" }) : null

  const addUsage = (u?: LLMUsage) => {
    if (!u) return
    usageTotal.input_tokens += u.input_tokens ?? 0
    usageTotal.output_tokens += u.output_tokens ?? 0
    usageTotal.total_tokens +=
      u.total_tokens ?? (u.input_tokens ?? 0) + (u.output_tokens ?? 0)
  }

  const write = (rec: TraceRecord) => {
    // Sink 1: local JSONL (for the `npm run trace` inspector). Disabled on
    // read-only serverless filesystems.
    if (dirWritable) {
      try {
        appendFileSync(filePath, JSON.stringify(rec) + "\n")
      } catch {
        // best-effort — never let tracing break the request
      }
    }
    // Sink 2: Langfuse (hosted, works on serverless).
    if (lfTrace) {
      try {
        recordToLangfuse(lfTrace, rec)
      } catch {
        // best-effort — never let tracing break the request
      }
    }
  }

  const log: Tracer["log"] = (rec) => {
    write({
      ts: new Date().toISOString(),
      trace_id: traceId,
      span_id: rec.span_id ?? shortId("spn"),
      ...rec,
    })
  }

  const wrapLLM: Tracer["wrapLLM"] = async (stage, prompt, model, fn) => {
    const spanId = shortId("spn")
    const start = performance.now()
    try {
      const r = await fn()
      const ms = Math.round(performance.now() - start)
      addUsage(r.usage)
      log({
        span_id: spanId,
        event: "llm_call",
        stage,
        ms,
        model,
        prompt,
        response: {
          text: r.text,
          structured: r.structured,
          finish_reason: r.finishReason,
        },
        usage: r.usage,
      })
      return r.value
    } catch (err) {
      const ms = Math.round(performance.now() - start)
      log({
        span_id: spanId,
        event: "error",
        stage,
        ms,
        model,
        prompt,
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  return {
    traceId,
    log,
    wrapLLM,
    addUsage,
    totalUsage: () => ({ ...usageTotal }),
  }
}
