import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Product, ProductFilters } from "../types"

/**
 * Product search over the JSON catalog.
 *
 * Structured filters, no embeddings — SPEC § "Product search uses zero
 * embeddings". `query` is a case-insensitive `contains` on name + category
 * (NOT semantic). All feature filters are ANDed: every requested feature
 * must appear in the product as an exact token match (word-boundary),
 * so "18V" does not match "180V" and "brushless" does not match "non-brushless".
 */

let catalogCache: readonly Product[] | null = null

function loadCatalog(): readonly Product[] {
  if (catalogCache) return catalogCache
  const path = join(process.cwd(), "data", "catalog.json")
  const parsed = JSON.parse(readFileSync(path, "utf-8")) as Product[]
  catalogCache = Object.freeze(parsed)
  return catalogCache
}

// Feature match uses a compiled regex per requested feature so that "18V"
// won't match "180V" and "impact" won't match a hypothetical "no-impact".
const featureRe = (feature: string) =>
  new RegExp(`(^|[^A-Za-z0-9])${escapeRe(feature)}([^A-Za-z0-9]|$)`, "i")

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export async function productSearch(filters: ProductFilters): Promise<Product[]> {
  let results: readonly Product[] = loadCatalog()

  if (filters.query) {
    const q = filters.query.toLowerCase()
    results = results.filter(
      (p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q),
    )
  }
  if (filters.category?.length) {
    const cats = new Set(filters.category.map((c) => c.toLowerCase()))
    results = results.filter((p) => cats.has(p.category.toLowerCase()))
  }
  if (filters.subcategory?.length) {
    const subs = new Set(filters.subcategory.map((s) => s.toLowerCase()))
    results = results.filter((p) => {
      const sub = (p.specs.subcategory ?? "").toLowerCase()
      return subs.has(sub)
    })
  }
  if (filters.brand?.length) {
    const brands = new Set(filters.brand.map((b) => b.toLowerCase()))
    results = results.filter((p) => brands.has(p.brand.toLowerCase()))
  }
  if (filters.price_min !== undefined) {
    results = results.filter((p) => p.price >= filters.price_min!)
  }
  if (filters.price_max !== undefined) {
    results = results.filter((p) => p.price <= filters.price_max!)
  }
  if (filters.features?.length) {
    const patterns = filters.features.map(featureRe)
    results = results.filter((p) => {
      const featureText = p.features.join(" ")
      return patterns.every((re) => re.test(featureText))
    })
  }
  if (filters.in_stock_only) {
    results = results.filter((p) => p.in_stock)
  }

  // Deterministic ranking: higher rating first, then lower price. Ties broken
  // by id so results are stable across runs — evals depend on this.
  const ranked = [...results].sort((a, b) => {
    if (b.avg_rating !== a.avg_rating) return b.avg_rating - a.avg_rating
    if (a.price !== b.price) return a.price - b.price
    return a.id.localeCompare(b.id)
  })

  return ranked.slice(0, filters.limit ?? 5)
}
