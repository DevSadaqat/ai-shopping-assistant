import type { StockResult } from "../types"

function seededRandom(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i)
  }
  h = h ^ (h >>> 16)
  return Math.abs(h) / 2147483647
}

export async function stockCheck(
  product_id: string,
  store_id?: string
): Promise<StockResult> {
  const seed = product_id + (store_id ?? "online")
  const r = seededRandom(seed)
  const qty = Math.floor(r * 50)
  const restock = qty === 0 ? new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0] : undefined

  return {
    product_id,
    qty_on_hand: qty,
    available_online: r > 0.2,
    click_and_collect: qty > 0 && r > 0.3,
    estimated_restock: restock,
  }
}
