import { describe, it, expect } from "vitest"
import { extractFilters } from "../lib/tools/extract-filters"
import goldenCases from "./golden/extract-filters.json"

type MustInclude = {
  subcategory?: string[]
  brand?: string[]
  brand_any?: string[]
  features_all?: string[]
  price_min?: number
  price_max?: number
  in_stock_only?: boolean
  category?: string[]
}

type GoldenCase = {
  id: string
  query: string
  must_include: MustInclude
  must_not_include?: string[]
}

describe("extract filters", () => {
  for (const tc of goldenCases as GoldenCase[]) {
    it(`[${tc.id}] "${tc.query}"`, async () => {
      const f = await extractFilters(tc.query)

      if (tc.must_include.subcategory) {
        expect(f.subcategory?.map((s) => s.toLowerCase())).toEqual(
          expect.arrayContaining(tc.must_include.subcategory.map((s) => s.toLowerCase())),
        )
      }
      if (tc.must_include.brand) {
        expect(f.brand?.map((b) => b.toLowerCase())).toEqual(
          expect.arrayContaining(tc.must_include.brand.map((b) => b.toLowerCase())),
        )
      }
      if (tc.must_include.brand_any) {
        const wantedLower = tc.must_include.brand_any.map((b) => b.toLowerCase())
        const gotLower = (f.brand ?? []).map((b) => b.toLowerCase())
        const overlap = gotLower.some((b) => wantedLower.includes(b))
        expect(overlap, `expected brand to include one of ${JSON.stringify(tc.must_include.brand_any)}`).toBe(true)
      }
      if (tc.must_include.features_all) {
        const gotLower = (f.features ?? []).map((x) => x.toLowerCase())
        for (const wanted of tc.must_include.features_all) {
          expect(gotLower, `feature "${wanted}" missing`).toContain(wanted.toLowerCase())
        }
      }
      if (tc.must_include.category) {
        expect(f.category?.map((c) => c.toLowerCase())).toEqual(
          expect.arrayContaining(tc.must_include.category.map((c) => c.toLowerCase())),
        )
      }
      if (tc.must_include.price_min !== undefined) {
        expect(f.price_min).toBe(tc.must_include.price_min)
      }
      if (tc.must_include.price_max !== undefined) {
        expect(f.price_max).toBe(tc.must_include.price_max)
      }
      if (tc.must_include.in_stock_only !== undefined) {
        expect(f.in_stock_only).toBe(tc.must_include.in_stock_only)
      }

      for (const forbidden of tc.must_not_include ?? []) {
        const v = (f as Record<string, unknown>)[forbidden]
        const isEmpty = v === undefined || (Array.isArray(v) && v.length === 0)
        expect(isEmpty, `field "${forbidden}" should be absent, got ${JSON.stringify(v)}`).toBe(true)
      }
    }, 15_000)
  }
})
