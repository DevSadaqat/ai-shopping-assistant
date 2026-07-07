import { readFileSync } from "node:fs"
import { join } from "node:path"
import { openai } from "@ai-sdk/openai"
import { generateText, Output } from "ai"
import { z } from "zod"
import type { Product, ProductFilters } from "../types"

// OpenAI's strict structured-output mode requires every schema property to be
// present in `required`. To model "may be absent," we use nullable — the
// model always returns the field but sets it to null when not applicable.
// We strip nulls before returning to callers so the ProductFilters shape stays
// clean (optional/undefined, not null).
const FiltersSchema = z.object({
  query: z.string().nullable(),
  category: z.array(z.string()).nullable(),
  subcategory: z.array(z.string()).nullable(),
  brand: z.array(z.string()).nullable(),
  price_min: z.number().nullable(),
  price_max: z.number().nullable(),
  features: z.array(z.string()).nullable(),
  in_stock_only: z.boolean().nullable(),
})

type RawFilters = z.infer<typeof FiltersSchema>

function stripNulls(raw: RawFilters): ProductFilters {
  const out: ProductFilters = {}
  if (raw.query !== null) out.query = raw.query
  if (raw.category !== null && raw.category.length > 0) out.category = raw.category
  if (raw.subcategory !== null && raw.subcategory.length > 0) out.subcategory = raw.subcategory
  if (raw.brand !== null && raw.brand.length > 0) out.brand = raw.brand
  if (raw.price_min !== null) out.price_min = raw.price_min
  if (raw.price_max !== null) out.price_max = raw.price_max
  if (raw.features !== null && raw.features.length > 0) out.features = raw.features
  if (raw.in_stock_only !== null) out.in_stock_only = raw.in_stock_only
  return out
}

/**
 * Read the catalog once at module init and derive the canonical vocabulary
 * (brands, categories, subcategories, features). The extractor system prompt
 * is then built from real catalog values, so it can't drift from the data.
 */
function loadVocabulary(): {
  brands: string[]
  categories: string[]
  subcategories: string[]
  features: string[]
} {
  const path = join(process.cwd(), "data", "catalog.json")
  const catalog = JSON.parse(readFileSync(path, "utf-8")) as Product[]
  const brands = new Set<string>()
  const categories = new Set<string>()
  const subcategories = new Set<string>()
  const features = new Set<string>()
  for (const p of catalog) {
    brands.add(p.brand)
    categories.add(p.category)
    if (p.specs.subcategory) subcategories.add(p.specs.subcategory)
    for (const f of p.features) features.add(f)
  }
  return {
    brands: [...brands].sort(),
    categories: [...categories].sort(),
    subcategories: [...subcategories].sort(),
    features: [...features].sort(),
  }
}

const VOCAB = loadVocabulary()

const EXTRACTOR_SYSTEM = `You extract structured product-search filters from a natural-language query for a hardware/home-improvement store.

Return every field in the schema. Set a field to null if the query does not mention it — do NOT invent constraints. Use ONLY values from the catalog vocabulary below; do not invent brand names, feature tokens, or categories.

Field rules (STRICT):
- query: ONLY when the product type isn't covered by \`subcategory\`. Never put brand names, feature tokens, or prices here. If \`subcategory\` is set, set \`query\` to null.
- category: one or more of ${JSON.stringify(VOCAB.categories)}.
- subcategory: preferred way to narrow product type. One or more of ${JSON.stringify(VOCAB.subcategories)}.
- brand: one or more of ${JSON.stringify(VOCAB.brands)}. Match user spelling to this list case-insensitively. NEVER include a brand as part of \`query\`.
- price_min / price_max: numeric bounds in dollars.
- features: attribute tokens. Use ONLY values from: ${JSON.stringify(VOCAB.features)}. Preserve exact casing/hyphenation. Any of these words in the user query MUST be captured here, not in \`query\`:
    "cordless", "corded", "brushless", "18V", "20V", "12V", "36V", "40V", and any other value from the features vocabulary above.
- in_stock_only: true if the user asks for available/in-stock items ("in stock", "available", "can I pick up", "near me").

Return JSON only.

Examples:
User: "DeWalt cordless drill in stock"
→ { "query": null, "subcategory": ["drill"], "brand": ["DeWalt"], "features": ["cordless"], "in_stock_only": true, "category": null, "price_min": null, "price_max": null }

User: "Cordless brushless angle grinder from Makita or Bosch"
→ { "query": null, "subcategory": ["grinder"], "brand": ["Makita", "Bosch"], "features": ["cordless", "brushless"], "in_stock_only": null, "category": null, "price_min": null, "price_max": null }

User: "Something under $80 for painting the ceiling"
→ { "query": null, "category": ["paint"], "price_max": 80, "subcategory": null, "brand": null, "features": null, "in_stock_only": null, "price_min": null }`

export async function extractFilters(userQuery: string): Promise<ProductFilters> {
  const result = await generateText({
    model: openai("gpt-4o-mini"),
    system: EXTRACTOR_SYSTEM,
    prompt: userQuery,
    output: Output.object({ schema: FiltersSchema }),
  })
  return stripNulls(result.output as RawFilters)
}
