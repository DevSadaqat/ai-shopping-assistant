export type Intent =
  | "PRODUCT_SEARCH"
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
  in_stock: boolean
  sku: string
}

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
