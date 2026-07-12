import { appendFileSync, existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { randomBytes } from "node:crypto"

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
function ensureDir() {
  if (dirEnsured) return
  if (!existsSync(TRACE_DIR)) mkdirSync(TRACE_DIR, { recursive: true })
  dirEnsured = true
}

function shortId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`
}

export function newTraceId(): string {
  return shortId("trc")
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

  const addUsage = (u?: LLMUsage) => {
    if (!u) return
    usageTotal.input_tokens += u.input_tokens ?? 0
    usageTotal.output_tokens += u.output_tokens ?? 0
    usageTotal.total_tokens +=
      u.total_tokens ?? (u.input_tokens ?? 0) + (u.output_tokens ?? 0)
  }

  const write = (rec: TraceRecord) => {
    try {
      appendFileSync(filePath, JSON.stringify(rec) + "\n")
    } catch {
      // best-effort — never let tracing break the request
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
