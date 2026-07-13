import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

type Record = {
  ts: string
  trace_id: string
  span_id: string
  event: string
  stage: string
  ms?: number
  model?: string
  prompt?: { system?: string; user?: string }
  response?: { text?: string; structured?: unknown; finish_reason?: string }
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number }
  data?: any
  error?: string
}

const TRACE_DIR = join(process.cwd(), ".traces")

function resolveInput(arg?: string): string {
  if (arg) {
    if (arg.endsWith(".jsonl")) return arg
    return join(TRACE_DIR, `${arg}.jsonl`)
  }
  const files = readdirSync(TRACE_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => ({ f, m: statSync(join(TRACE_DIR, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)
  if (files.length === 0) {
    console.error("No trace files in .traces/")
    process.exit(1)
  }
  return join(TRACE_DIR, files[0].f)
}

function pad(s: string, w: number): string {
  if (s.length >= w) return s.slice(0, w - 1) + "…"
  return s + " ".repeat(w - s.length)
}
function rpad(s: string | number, w: number): string {
  const str = String(s ?? "-")
  if (str.length >= w) return str
  return " ".repeat(w - str.length) + str
}

function detail(r: Record): string {
  if (r.event === "request_start")
    return `msg="${(r.data?.user_message ?? "").slice(0, 80)}"`
  if (r.event === "router_decision") {
    const d = r.data ?? {}
    return `intent=${d.intent} confidence=${d.confidence} → ${d.effective_intent}`
  }
  if (r.event === "safety_rule_match")
    return `trade=${r.data?.trade}`
  if (r.event === "retrieval")
    return `sources=${(r.data?.sources ?? []).length}`
  if (r.event === "tool_call" && r.stage === "product_search") {
    const d = r.data ?? {}
    return `results=${d.result_count} ids=[${(d.result_ids ?? []).slice(0, 3).join(",")}${(d.result_ids ?? []).length > 3 ? "…" : ""}]`
  }
  if (r.event === "tool_call" && r.stage === "stock_check") {
    const d = r.data ?? {}
    if (!d.resolved) return "no product matched"
    return `id=${d.resolved.id} qty=${d.stock?.qty_on_hand}`
  }
  if (r.event === "llm_call") {
    if (r.stage === "router" && r.response?.structured) {
      const s = r.response.structured as any
      return `→ intent=${s.intent} confidence=${s.confidence}`
    }
    if (r.stage === "extractor" && r.response?.structured) {
      const keys = Object.keys(r.response.structured).filter(
        (k) => (r.response!.structured as any)[k] !== null && (r.response!.structured as any)[k] !== undefined,
      )
      return `fields=[${keys.join(",")}] finish=${r.response?.finish_reason}`
    }
    return `finish=${r.response?.finish_reason ?? "-"}`
  }
  if (r.event === "request_end") {
    const p = r.data?.path ?? "?"
    return `path=${p}`
  }
  if (r.event === "error") return `error="${(r.error ?? "").slice(0, 80)}"`
  return ""
}

const path = resolveInput(process.argv[2])
const raw = readFileSync(path, "utf-8").trim().split("\n").filter(Boolean)
const records: Record[] = raw.map((l) => JSON.parse(l))

if (records.length === 0) {
  console.error(`Empty trace file: ${path}`)
  process.exit(1)
}

const traceId = records[0].trace_id
const t0 = new Date(records[0].ts).getTime()

console.log(`\nTrace: ${traceId}`)
console.log(`File:  ${path}`)
console.log("─".repeat(110))
console.log(
  `${rpad("t+ms", 6)}  ${rpad("dur", 5)}  ${pad("stage", 20)}  ${pad("event", 20)}  ${rpad("in", 5)}  ${rpad("out", 5)}  detail`,
)
console.log("─".repeat(110))

let totalIn = 0
let totalOut = 0
for (const r of records) {
  const tOffset = new Date(r.ts).getTime() - t0
  const inTok = r.usage?.input_tokens ?? 0
  const outTok = r.usage?.output_tokens ?? 0
  totalIn += inTok
  totalOut += outTok
  console.log(
    `${rpad(tOffset, 6)}  ${rpad(r.ms ?? "", 5)}  ${pad(r.stage, 20)}  ${pad(r.event, 20)}  ${rpad(inTok || "", 5)}  ${rpad(outTok || "", 5)}  ${detail(r)}`,
  )
}

console.log("─".repeat(110))
const end = records.find((r) => r.event === "request_end")
const totalMs = end?.ms ?? new Date(records.at(-1)!.ts).getTime() - t0
const path_ = end?.data?.path ?? "(no request_end)"
console.log(
  `Total: ${totalMs}ms · tokens in=${totalIn} out=${totalOut} total=${totalIn + totalOut} · path=${path_}\n`,
)
