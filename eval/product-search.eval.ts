import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it, expect } from "vitest"
import { productSearch } from "../lib/tools/product-search"
import type { Product, ProductFilters } from "../lib/types"
import goldenCases from "./golden/product-search.json"

/**
 * Concrete per-case constraint check.
 * Deliberately NOT re-using productSearch's filter code — asserts on the SPEC
 * semantics using an independent implementation so a bug in productSearch
 * would surface here rather than pass both sides silently.
 */
type Constraints = {
  brand?: string
  subcategory?: string
  category?: string
  price_min?: number
  price_max?: number
  in_stock?: boolean
  features_all?: string[]
}

type GoldenCase = {
  id: string
  query: string
  expected_filters: ProductFilters
  golden_ids: string[]
  constraints: Constraints
}

const catalog: Product[] = JSON.parse(
  readFileSync(join(process.cwd(), "data", "catalog.json"), "utf-8"),
) as Product[]
const catalogIds = new Set(catalog.map((p) => p.id))

function assertConstraints(p: Product, c: Constraints): void {
  if (c.brand !== undefined) {
    expect(p.brand.toLowerCase(), `${p.id} brand`).toBe(c.brand.toLowerCase())
  }
  if (c.subcategory !== undefined) {
    expect(p.specs.subcategory?.toLowerCase(), `${p.id} subcategory`).toBe(
      c.subcategory.toLowerCase(),
    )
  }
  if (c.category !== undefined) {
    expect(p.category.toLowerCase(), `${p.id} category`).toBe(c.category.toLowerCase())
  }
  if (c.price_min !== undefined) {
    expect(p.price, `${p.id} price_min`).toBeGreaterThanOrEqual(c.price_min)
  }
  if (c.price_max !== undefined) {
    expect(p.price, `${p.id} price_max`).toBeLessThanOrEqual(c.price_max)
  }
  if (c.in_stock !== undefined) {
    expect(p.in_stock, `${p.id} in_stock`).toBe(c.in_stock)
  }
  if (c.features_all) {
    const productFeaturesLower = p.features.map((f) => f.toLowerCase())
    for (const wanted of c.features_all) {
      expect(
        productFeaturesLower,
        `${p.id} must have feature ${wanted}`,
      ).toContain(wanted.toLowerCase())
    }
  }
}

describe("product search", () => {
  for (const tc of goldenCases as GoldenCase[]) {
    describe(`[${tc.id}] ${tc.query}`, () => {
      it("precision@K — all golden IDs appear in top K", async () => {
        const k = tc.golden_ids.length
        const results = await productSearch({ ...tc.expected_filters, limit: k })
        const returnedIds = results.map((p) => p.id)
        for (const gid of tc.golden_ids) {
          expect(returnedIds).toContain(gid)
        }
      })

      it("filter_respect — every returned product satisfies stated constraints", async () => {
        const results = await productSearch({ ...tc.expected_filters, limit: 5 })
        expect(results.length, "results must not be empty").toBeGreaterThan(0)
        for (const p of results) assertConstraints(p, tc.constraints)
      })

      it("no_hallucination — every returned product exists in the catalog", async () => {
        const results = await productSearch({ ...tc.expected_filters, limit: 5 })
        for (const p of results) {
          expect(catalogIds.has(p.id), `${p.id} not in catalog`).toBe(true)
        }
      })
    })
  }
})
