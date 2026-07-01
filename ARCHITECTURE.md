# Shopping Assistant — Architecture

## Problem

A single shopping assistant UI conceals three fundamentally different retrieval problems. The common mistake is treating them as one big RAG problem. This project routes by intent and applies the right retrieval strategy to each path.

---

## High-Level Architecture

```
User turn
    │
    ▼
Intent Router (Haiku, ~200ms)       ← separate call, auditable, testable
    │
    ├─ PRODUCT_SEARCH ──► product_search()  ──► Prisma WHERE query (no embeddings)
    ├─ HOW_TO         ──► how_to_rag()      ──► embed → retrieve → rerank → generate
    ├─ STOCK_CHECK    ──► stock_check()     ──► seeded sim (one-line swap for real API)
    ├─ SAFETY_ESCALATE──► safety_escalate() ──► static rule match → refusal (no generation)
    └─ CLARIFY        ──► follow-up question (no tool call)
```

**Single-agent loop.** One Sonnet call per turn for generation, one Haiku call for routing. No multi-agent graph — the complexity isn't warranted.

---

## Phase 1 — What Was Built

Phase 1 establishes the routing layer and a working chat UI before any real retrieval is wired up. The goal is to confirm routing accuracy before building the retrieval paths.

### Files

| File | Purpose |
|---|---|
| `lib/types.ts` | Shared TypeScript types for all 5 intents and 4 tool contracts |
| `lib/router.ts` | Intent classifier — separate Haiku call, returns `{ intent, confidence }` |
| `lib/tools/product-search.ts` | Stub — 3 hardcoded drill SKUs; filter logic for price/brand/features |
| `lib/tools/stock-check.ts` | Stub — seeded deterministic function (`hash(product_id + store_id)`) |
| `lib/tools/how-to-rag.ts` | Stub — 3 hardcoded bathroom tiling chunks |
| `lib/tools/safety-escalate.ts` | Rule-based regex match per trade type; returns `EscalationResponse \| null` |
| `app/api/chat/route.ts` | Chat API route: classify → tool context → `streamText` |
| `app/page.tsx` | Chat UI shell using AI SDK v7 `useChat` |
| `eval/golden/router.json` | 18 golden cases across all 5 intents |
| `eval/router.eval.ts` | Vitest harness; `npm run eval` runs against live Haiku |

### Intent Router (`lib/router.ts`)

A dedicated Claude Haiku call classifies every user turn before generation. Haiku is used specifically for low latency (~200ms). The output is a structured object validated against a Zod schema:

```typescript
{ intent: "PRODUCT_SEARCH" | "HOW_TO" | "STOCK_CHECK" | "SAFETY_ESCALATE" | "CLARIFY",
  confidence: "high" | "medium" | "low" }
```

The router is separate from the generation prompt — this makes routing decisions independently auditable and testable.

### Tool Stubs

Each stub implements the full type contract from `SPEC.md` but returns hardcoded or simulated data. They are designed as drop-in replacements: Phase 2–4 swap the implementation without changing the call sites.

**`stock-check`** uses a seeded deterministic hash so eval results are reproducible across runs without a live inventory API.

**`safety-escalate`** is rule-based (regex patterns), not LLM-classified. For a hard liability boundary, a deterministic rule set with known coverage beats probabilistic classification. Five trade types are covered: electrician, gas-fitter, structural engineer, plumber, asbestos removalist.

### Chat API Route (`app/api/chat/route.ts`)

Request flow:
1. Parse `UIMessage[]` from request body
2. Extract last user turn text
3. Call `classifyIntent()` → get `intent`
4. If `SAFETY_ESCALATE` and rule matches → stream refusal message directly (no tool context injected)
5. Otherwise → build tool context string appropriate to the intent
6. `streamText` with Sonnet and tool context injected into system prompt
7. Return `toUIMessageStreamResponse()`

### Chat UI (`app/page.tsx`)

Minimal shell using AI SDK v7's `useChat` hook. Manages its own `input` state (v7 no longer provides `handleInputChange`). Sends via `sendMessage({ text })`. Renders `UIMessage.parts` filtered through `isTextUIPart`.

### Eval Harness

```
npm run eval
```

Runs 18 golden cases through the live Haiku router. Each test has a 15 s timeout. Requires `ANTHROPIC_API_KEY` in `.env.local`.

Golden cases cover edge cases within each intent: price-only product searches, stock queries phrased as questions, safe DIY tasks that must NOT escalate (light switch swap, tap washer), and ambiguous queries that should route to CLARIFY.

---

## Key Design Decisions

### 1. Product search uses zero embeddings
Structured filters (`price_max`, `features[]`, `brand[]`) over a SQL DB beat cosine similarity when the query is attribute-driven. Embedding "18V brushless drill under $200" and doing vector search loses the hard price constraint.

### 2. Routing happens before generation
The router is a separate Haiku call, not a system prompt instruction to the generation model. This keeps the generation prompt clean and makes the routing decision independently testable.

### 3. Stock is a tool, not RAG
Inventory state changes in real time. Any RAG approach would serve stale data. The Phase 1 seeded sim is a one-function swap for a real API call.

### 4. Safety escalation is rule-based
For a hard liability boundary, a deterministic rule set with known recall beats probabilistic LLM classification. The LLM handles phrasing the refusal; the rules decide whether to refuse.

---

## Stack

| Layer | Choice |
|---|---|
| Runtime | Next.js 15 App Router (Next 16.2.9) |
| AI SDK | Vercel AI SDK v7 (`ai@7.0.4`, `@ai-sdk/anthropic@4.0.1`, `@ai-sdk/react@4.0.5`) |
| Models | Routing: `claude-haiku-4-5-20251001` / Generation: `claude-sonnet-4-6` |
| DB | SQLite via Prisma (Phase 2+) |
| Embeddings | OpenAI `text-embedding-3-small` (Phase 4) |
| Reranker | Cohere Rerank v3, fallback to Haiku rerank (Phase 4) |
| UI | React 19 + Tailwind v4 |
| Evals | Vitest + LLM-as-judge |

---

## Build Phases

| Phase | Scope | Status |
|---|---|---|
| 1 — Router + stubs + UI | Intent router, tool stubs, chat shell, router golden test | ✅ Done |
| 2 — Product search + catalog | Catalog generator, Prisma schema, real `product_search`, product eval | Pending |
| 3 — Stock + safety | `stock_check` seeded sim, `safety_escalate` rule list, safety eval (recall ≥ 0.95, FPR ≤ 0.10) | Pending |
| 4 — RAG pipeline | Guide chunking + embedding, cosine retrieval, reranker, `how_to_rag` eval | Pending |
| 5 — Evals + write-up | All three golden sets automated, red-team safety session, README with diagram | Pending |
