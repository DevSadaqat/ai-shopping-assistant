This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Observability

When an AI agent fails, a stack trace tells you nothing about *why* the model chose what it chose. Every chat request emits a structured trace covering the full reasoning workflow: router decision, filter extraction, tool calls, retrieval context, generator prompt/response, and per-call token usage.

### Where traces live

- One file per request at `.traces/{trace_id}.jsonl` (gitignored).
- Same records mirrored to stdout for real-time tailing.
- Each response includes an `x-trace-id` header so the client can correlate a UI turn to its trace file.

### Event types

Every line is a JSON record sharing the same `trace_id`. Events emitted per request:

| Event | Stage(s) | What it captures |
|---|---|---|
| `request_start` | `request` | User message, message count |
| `safety_rule_match` | `safety_rule` | Matched trade + refusal message (no LLM call) |
| `llm_call` | `router`, `extractor`, `generator*` | Full system + user prompt, structured output, finish reason, model, `input_tokens` / `output_tokens` / `total_tokens`, ms |
| `router_decision` | `router` | Raw intent, confidence, effective intent, parallel latencies |
| `tool_call` | `product_search`, `stock_check`, `how_to_rag` | Filters, result IDs, resolved product, stock payload, ms |
| `retrieval` | `how_to_rag` | Query, source titles, scores, chunk previews |
| `error` | any | Error message + which stage failed |
| `request_end` | `request` | Total ms, path taken, cumulative token roll-up across all model calls |

### Inspecting a trace

Pretty-print a request as a waterfall:

```bash
npm run trace                       # newest trace file
npm run trace trc_abc123def456      # by trace id
npm run trace .traces/foo.jsonl     # by explicit path
```

Sample output:

```
Trace: trc_4d46d16f32e1
─────────────────────────────────────────────────────────────────────
  t+ms    dur  stage           event               in    out  detail
─────────────────────────────────────────────────────────────────────
     0         request         request_start                  msg="find me 18V brushless drill under $200"
  2714   2713  router          llm_call            668    11  → intent=PRODUCT_SEARCH confidence=high
  3585   3582  extractor       llm_call           1200    49  fields=[subcategory,price_max,features]
  3586         router          router_decision                intent=PRODUCT_SEARCH → PRODUCT_SEARCH
  3588      2  product_search  tool_call                      results=2 ids=[prod-004,prod-003]
  6207   2615  generator       llm_call           1000   180  finish=stop
  6208   6208  request         request_end                    path=generator:product_search
─────────────────────────────────────────────────────────────────────
Total: 6208ms · tokens in=2868 out=240 total=3108 · path=generator:product_search
```

For ad-hoc queries, `jq` works directly on the JSONL:

```bash
# Stage timeline
jq -r '[.ms, .event, .stage] | @tsv' .traces/trc_*.jsonl

# Token totals for the request
jq 'select(.event=="request_end") | .data.usage_total' .traces/trc_*.jsonl

# All prompts sent to the router
jq 'select(.stage=="router") | .prompt' .traces/trc_*.jsonl
```

### Design notes

- **Router + extractor run in parallel.** The extractor is speculative — its tokens are only useful when the intent turns out to be `PRODUCT_SEARCH`. The trace shows this cost per turn so the tradeoff is visible.
- **The extractor system prompt embeds the catalog vocabulary** (all brands, categories, subcategories, features). This dominates its input tokens — the trace makes that obvious and points at the first thing to cache if the catalog grows.
- **Safety rules match before any model call.** A `safety_rule_match` event with no preceding `llm_call` is the deterministic refusal path — the LLM is never the sole arbiter of a licensed-trade refusal.
- **Tracing is best-effort.** File writes are wrapped in try/catch — a filesystem failure will not break the request.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
