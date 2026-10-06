import { checkSafetyEscalation } from "./tools/safety-escalate"
import { buildKit, detectProject, isExteriorProject } from "./tools/project-kit"
import { productSearch } from "./tools/product-search"
import { stockCheck } from "./tools/stock-check"
import type { Tracer } from "./trace"
import type {
  HowToResult,
  Intent,
  Product,
  ProductCardData,
  ProductFilters,
  ProjectKit,
  RouterResult,
} from "./types"

/**
 * One turn: the customer's latest message in, a reply plan out.
 *
 * Owns every decision about how to answer — safety, routing, which tool runs,
 * the generator's prompt and model tier, and which cards follow the text. It
 * does not stream: the caller renders the plan. The model-backed steps are
 * passed in so tests can script them.
 */

export type ModelTier = "premium" | "light"

export type ReplyPlan =
  | { kind: "fixed"; text: string; path: string }
  | {
      kind: "generate"
      system: string
      tier: ModelTier
      cards: ProductCardData | null
      path: string
    }

export type TurnDeps = {
  classifyIntent: (text: string) => Promise<RouterResult>
  extractFilters: (text: string) => Promise<ProductFilters>
  retrieveGuides: (query: string) => Promise<HowToResult>
  tracer?: Tracer
  onProgress?: (label: string, stage: string) => void
}

export async function planTurn(text: string, deps: TurnDeps): Promise<ReplyPlan> {
  const { tracer } = deps
  const progress = deps.onProgress ?? (() => {})

  // Rule-based safety FIRST. Deterministic liability boundary — the LLM is
  // never the sole arbiter of a refusal (SPEC key decision #4).
  const ruleRefusal = checkSafetyEscalation(text)
  if (ruleRefusal) {
    tracer?.log({
      event: "safety_rule_match",
      stage: "safety_rule",
      data: { trade: ruleRefusal.trade, message: ruleRefusal.message },
    })
    progress("Preparing a safety response", "safety_refused")
    return { kind: "fixed", text: ruleRefusal.message, path: "safety_rule_refused" }
  }

  // Router + extractor in parallel. Extractor is speculative — only used on
  // intents that need filters. Cheap gpt-4o-mini; the latency win outweighs
  // the wasted call on other turns.
  progress("Understanding your request", "router")
  const [routerRes, filtersRes] = await Promise.all([
    timed(() => deps.classifyIntent(text)),
    timed(() =>
      deps.extractFilters(text).catch((err): ProductFilters => {
        tracer?.log({ event: "error", stage: "extractor", error: String(err) })
        return { query: text }
      }),
    ),
  ])
  const { intent, confidence } = routerRes.value

  // Low confidence → CLARIFY. The router can be uncertain; treat that as a
  // signal to ask, not to guess.
  const effectiveIntent: Intent = confidence === "low" ? "CLARIFY" : intent
  tracer?.log({
    event: "router_decision",
    stage: "router",
    data: {
      intent,
      confidence,
      effective_intent: effectiveIntent,
      ms_router: routerRes.ms,
      ms_extractor: filtersRes.ms,
    },
  })

  return HANDLERS[effectiveIntent]({ text, filters: filtersRes.value, deps, progress })
}

type HandlerArgs = {
  text: string
  filters: ProductFilters
  deps: TurnDeps
  progress: (label: string, stage: string) => void
}

const BASE_PROMPT =
  "You are a helpful hardware and home-improvement store assistant. Be concise and practical."

const HANDLERS: Record<Intent, (args: HandlerArgs) => Promise<ReplyPlan>> = {
  CLARIFY: async ({ progress }) => {
    progress("Writing your answer", "generator")
    return {
      kind: "generate",
      system: `${BASE_PROMPT}\n\nThe customer's request is ambiguous. Ask one focused clarifying question to determine whether they need product recommendations, how-to guidance, or a stock check.`,
      // A single clarifying question doesn't warrant the premium model.
      tier: "light",
      cards: null,
      path: "generator:clarify",
    }
  },
  PRODUCT_SEARCH: async ({ filters, deps, progress }) => {
    progress("Searching the catalog", "product_search")
    const search = await timed(() => productSearch({ ...filters, limit: 5 }))
    const products = search.value
    deps.tracer?.log({
      event: "tool_call",
      stage: "product_search",
      ms: search.ms,
      data: { filters, result_count: products.length, result_ids: products.map((p) => p.id) },
    })
    const toolContext = `Applied filters:\n${JSON.stringify(filters)}\n\nProduct search results (${products.length}):\n${JSON.stringify(products.map(compactProduct))}`
    progress("Writing your answer", "generator")
    if (products.length === 0) {
      return {
        kind: "generate",
        system: `${BASE_PROMPT}\n\nNo products matched the customer's criteria. Explain briefly what was searched (from the applied filters below) and ask a targeted question to broaden the search (e.g. drop a constraint or try a different brand). Do not invent products.\n\n${toolContext}`,
        // A "nothing matched — broaden your search" nudge doesn't warrant the
        // premium model.
        tier: "light",
        cards: null,
        path: "generator:product_search",
      }
    }
    return {
      kind: "generate",
      system: `${BASE_PROMPT}\n\nThe following products match the customer's query AND are already shown to them as product cards (name, price, rating, specs, stock all visible). Do NOT re-list the products or their prices/specs as bullets — that duplicates the cards. Instead write 2-3 sentences of prose: what stands out, how to choose between them, or a top pick and why. Only reference products from this list — do not invent products.\n\n${toolContext}`,
      tier: "premium",
      cards: { kind: "search", products },
      path: "generator:product_search",
    }
  },
  // Whole-project bundle. If we can't identify which supported project this
  // is, ask rather than guess — silently defaulting to a painting kit for "a
  // kit for my treehouse" hands the customer a confidently wrong bundle.
  PROJECT_KIT: async ({ text, filters, deps, progress }) => {
    const project = detectProject(text)
    if (project === null) {
      deps.tracer?.log({
        event: "router_decision",
        stage: "project_kit_unknown",
        data: { note: "PROJECT_KIT but no supported project detected" },
      })
      progress("Preparing a response", "project_kit_clarify")
      return {
        kind: "fixed",
        text: "I can put together a full kit for a few projects — painting a room, a garden bed, or a bathroom fixture refresh. Which one are you working on, and do you have a total budget in mind?",
        path: "project_kit_clarify",
      }
    }
    // Budget comes from the extractor's price_max; painting also picks
    // interior vs exterior. Cards render the kit; the generator writes the
    // walkthrough from the same data.
    progress("Putting together your kit", "project_kit")
    const exterior = project === "painting" && isExteriorProject(text)
    const kitRes = await timed(() =>
      buildKit({ project, budget: filters.price_max ?? null, exterior, brand: filters.brand }),
    )
    const kit = kitRes.value
    deps.tracer?.log({
      event: "tool_call",
      stage: "project_kit",
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
    })
    const kind = project === "painting" ? `painting, ${exterior ? "exterior" : "interior"}` : project
    const toolContext = `Project kit (${kind}):\n${JSON.stringify(compactKit(kit))}`
    progress("Writing your answer", "generator")
    return {
      kind: "generate",
      system: `${BASE_PROMPT}\n\nThe customer wants everything for a home project (the kit's "project" field says which — painting, garden, or bathroom). A kit has been assembled from the catalog below and is ALREADY shown to them as product cards — every item name, price, rating and spec is visible in the cards. Do NOT re-list the items or their prices/specs as a numbered or bulleted list; that just duplicates the cards. Write a short, friendly walkthrough in 2-4 sentences of prose: what the kit covers as a whole, the running total vs their budget, and — if within_budget is false or items were skipped — say so plainly and suggest one next step (raise budget, smaller scope, or which item to add back). Only reference products in this kit; do not invent products.\n\n${toolContext}`,
      tier: "premium",
      cards: { kind: "kit", kit },
      path: "generator:project_kit",
    }
  },
  HOW_TO: async ({ text, deps, progress }) => {
    progress("Reading the guides", "how_to")
    const rag = await timed(() => deps.retrieveGuides(text))
    const toolContext = rag.value.sources.map((s) => `[${s.title}]\n${s.chunk}`).join("\n\n")
    deps.tracer?.log({
      event: "tool_call",
      stage: "how_to_rag",
      ms: rag.ms,
      data: { source_count: rag.value.sources.length },
    })
    progress("Writing your answer", "generator")
    return {
      kind: "generate",
      system: toolContext
        ? `${BASE_PROMPT}\n\nAnswer based only on the following guide excerpts. If the excerpts don't cover the question, say so.\n\n${toolContext}`
        : BASE_PROMPT,
      tier: "premium",
      cards: null,
      path: "generator:how_to",
    }
  },
  // Resolve the product from the query via the same filter path — top-1
  // rated match wins. If nothing matches, have the customer name it rather
  // than answering about a random SKU.
  STOCK_CHECK: async ({ filters, deps, progress }) => {
    progress("Finding the product", "stock_check_resolve")
    const resolve = await timed(() => productSearch({ ...filters, limit: 1 }))
    let toolContext: string
    if (resolve.value.length === 0) {
      deps.tracer?.log({
        event: "tool_call",
        stage: "stock_check",
        ms: resolve.ms,
        data: { filters, resolved: null, note: "no product matched" },
      })
      toolContext = `We could not identify which product the customer is asking about. Ask them to specify the product by name, brand, or SKU.`
    } else {
      const target = resolve.value[0]
      progress(`Checking stock for ${target.name}`, "stock_check_lookup")
      const stock = await timed(() => stockCheck(target.id))
      toolContext = `Product identified: ${target.name} (${target.id}).\n\nStock:\n${JSON.stringify(stock.value)}`
      deps.tracer?.log({
        event: "tool_call",
        stage: "stock_check",
        ms: resolve.ms + stock.ms,
        data: {
          filters,
          resolved: { id: target.id, name: target.name },
          stock: stock.value,
          ms_resolve: resolve.ms,
          ms_stock: stock.ms,
        },
      })
    }
    progress("Writing your answer", "generator")
    return {
      kind: "generate",
      system: `${BASE_PROMPT}\n\nUse the following stock data to answer the customer's availability question. If no product was identified, ask the customer to clarify which item.\n\n${toolContext}`,
      tier: "premium",
      cards: null,
      path: "generator:stock_check",
    }
  },
  // A router-classified SAFETY_ESCALATE that the rules didn't already catch
  // is a soft-refusal path — generic message, no product context.
  SAFETY_ESCALATE: async ({ deps, progress }) => {
    deps.tracer?.log({
      event: "router_decision",
      stage: "safety_router_only",
      data: { note: "router flagged safety but no rule matched" },
    })
    progress("Preparing a safety response", "safety_router_refused")
    return {
      kind: "fixed",
      text: "That work should be handled by a licensed trade. I can help you source materials once a professional has assessed the job.",
      path: "safety_router_refused",
    }
  },
  OFF_TOPIC: async ({ progress }) => {
    progress("Preparing a response", "off_topic")
    return {
      kind: "fixed",
      text: "I'm here to help with your shopping needs. What can I help you look for today?",
      path: "off_topic",
    }
  },
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = performance.now()
  const value = await fn()
  return { value, ms: Math.round(performance.now() - start) }
}

// The product cards already show every field to the customer; the generator
// only needs enough to write a couple of sentences of prose (pick / compare /
// broaden). Projecting to the decision-relevant fields — and dropping the
// pretty-print indent — keeps the tool context small, which is exactly the
// "cap tool responses, pass only what's needed" guidance for context
// management. Full objects still go to the client as cards.
function compactProduct(p: Product) {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    price: p.price,
    rating: p.avg_rating,
    in_stock: p.in_stock,
    features: p.features.slice(0, 4),
  }
}

function compactKit(kit: ProjectKit) {
  return {
    project: kit.project,
    budget: kit.budget,
    total: kit.total,
    within_budget: kit.within_budget,
    items: kit.items.map((it) => ({
      role: it.label,
      name: it.product.name,
      price: it.product.price,
      reason: it.reason,
    })),
    skipped: kit.skipped.map((s) => s.label),
    note: kit.note,
  }
}
