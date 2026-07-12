import { describe, it, expect } from "vitest"
import { stockCheck } from "../lib/tools/stock-check"
import goldenCases from "./golden/stock-check.json"

type StockCase = {
  id: string
  product_id: string
  store_id?: string
  note?: string
}

const cases = goldenCases as StockCase[]

describe("stock check (deterministic)", () => {
  for (const tc of cases) {
    it(`[${tc.id}] same input → same output`, async () => {
      const a = await stockCheck(tc.product_id, tc.store_id)
      const b = await stockCheck(tc.product_id, tc.store_id)
      expect(a).toEqual(b)
      expect(a.product_id).toBe(tc.product_id)
      expect(a.qty_on_hand).toBeGreaterThanOrEqual(0)
      expect(a.qty_on_hand).toBeLessThan(50)
    })
  }

  it("store_id changes the seed", async () => {
    const online = await stockCheck("prod-042")
    const store = await stockCheck("prod-042", "store-01")
    // If qty happens to collide, at least one derived boolean will differ.
    const different =
      online.qty_on_hand !== store.qty_on_hand ||
      online.available_online !== store.available_online ||
      online.click_and_collect !== store.click_and_collect
    expect(different, "different store_id should yield different stock signal").toBe(true)
  })

  it("different products produce different stock signals for most cases", async () => {
    const ids = ["prod-001", "prod-042", "prod-107", "prod-203", "prod-350", "prod-500"]
    const results = await Promise.all(ids.map((id) => stockCheck(id)))
    const uniqueQty = new Set(results.map((r) => r.qty_on_hand))
    // Not strictly required, but the seed should produce reasonable spread.
    expect(uniqueQty.size, "expect at least 4 distinct qty values across 6 products").toBeGreaterThanOrEqual(4)
  })

  it("restock date only present when qty is zero", async () => {
    for (const tc of cases) {
      const r = await stockCheck(tc.product_id, tc.store_id)
      if (r.qty_on_hand === 0) {
        expect(r.estimated_restock, `${tc.product_id} zero qty must have restock date`).toBeTypeOf("string")
      } else {
        expect(r.estimated_restock, `${tc.product_id} non-zero qty must NOT have restock date`).toBeUndefined()
      }
    }
  })
})
