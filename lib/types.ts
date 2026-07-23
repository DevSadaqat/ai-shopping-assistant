export type Intent =
  | "PRODUCT_SEARCH"
  | "PROJECT_KIT"
  | "HOW_TO"
  | "STOCK_CHECK"
  | "SAFETY_ESCALATE"
  | "CLARIFY"
  | "OFF_TOPIC"

export type RouterResult = {
  intent: Intent
  confidence: "high" | "medium" | "low"
}

// --- product_search ---
export type ProductFilters = {
  query?: string
  category?: string[]
  subcategory?: string[]
  brand?: string[]
  price_min?: number
  price_max?: number
  features?: string[]
  in_stock_only?: boolean
  limit?: number
}

export type Product = {
  id: string
  name: string
  brand: string
  category: string
  price: number
  features: string[]
  specs: Record<string, string>
  avg_rating: number
  review_count: number
  in_stock: boolean
  qty_on_hand: number
  sku: string
}

// --- project_kit ---
// A "kit" is a budget-aware bundle of complementary products for a project
// (e.g. painting: primer + topcoat + brush + roller). Assembled deterministically
// from the catalog so it stays under the customer's total budget.
export type KitRole = {
  key: string // e.g. "primer", "topcoat", "brush", "roller"
  label: string // human label shown to the customer
  essential: boolean // essentials are kept even when the budget is tight
}

export type KitItem = {
  role: string // KitRole.key this product fills
  label: string // KitRole.label
  product: Product
  reason: string // why this product was picked (rating / cheapest-that-fits)
}

export type ProjectKit = {
  project: string // e.g. "painting"
  budget: number | null // customer's total budget, if given
  total: number // sum of item prices
  within_budget: boolean
  items: KitItem[]
  skipped: Array<{ label: string; reason: string }> // roles dropped to hit budget
  note?: string
}

// Structured payload streamed to the client as a `data-products` part and
// rendered as product cards. Either flat search hits or an assembled budget kit.
export type ProductCardData =
  | { kind: "search"; products: Product[] }
  | { kind: "kit"; kit: ProjectKit }

// --- how_to_rag ---
export type HowToResult = {
  answer: string
  sources: Array<{ title: string; chunk: string; score: number }>
  needs_clarification: boolean
}

// --- stock_check ---
export type StockResult = {
  product_id: string
  qty_on_hand: number
  available_online: boolean
  click_and_collect: boolean
  estimated_restock?: string
}

// --- safety_escalate ---
export type TradeType =
  | "electrician"
  | "plumber"
  | "gas-fitter"
  | "structural-engineer"
  | "asbestos-removalist"

export type EscalationResponse = {
  refused: true
  trade: TradeType
  message: string
}
