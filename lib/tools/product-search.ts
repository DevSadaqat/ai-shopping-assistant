import type { Product, ProductFilters } from "../types"

const STUB_PRODUCTS: Product[] = [
  {
    id: "prod-042",
    sku: "SKU-042",
    name: "Makita 18V LXT Brushless Drill Driver",
    brand: "Makita",
    category: "power-tools",
    price: 179,
    features: ["18V", "brushless", "cordless", "variable-speed"],
    specs: { voltage: "18V", chuck: "13mm", weight: "1.7kg" },
    avg_rating: 4.7,
    in_stock: true,
  },
  {
    id: "prod-107",
    sku: "SKU-107",
    name: "Milwaukee M18 Fuel Brushless Drill",
    brand: "Milwaukee",
    category: "power-tools",
    price: 199,
    features: ["18V", "brushless", "cordless", "auto-stop"],
    specs: { voltage: "18V", chuck: "13mm", weight: "1.9kg" },
    avg_rating: 4.8,
    in_stock: true,
  },
  {
    id: "prod-203",
    sku: "SKU-203",
    name: "DeWalt DCD796 18V XR Brushless Compact Drill",
    brand: "DeWalt",
    category: "power-tools",
    price: 159,
    features: ["18V", "brushless", "cordless", "compact"],
    specs: { voltage: "18V", chuck: "13mm", weight: "1.5kg" },
    avg_rating: 4.6,
    in_stock: false,
  },
]

export async function productSearch(filters: ProductFilters): Promise<Product[]> {
  // Phase 2 replaces this with Prisma WHERE clauses over SQLite
  let results = [...STUB_PRODUCTS]

  if (filters.in_stock_only) {
    results = results.filter((p) => p.in_stock)
  }
  if (filters.price_max !== undefined) {
    results = results.filter((p) => p.price <= filters.price_max!)
  }
  if (filters.price_min !== undefined) {
    results = results.filter((p) => p.price >= filters.price_min!)
  }
  if (filters.features?.length) {
    results = results.filter((p) =>
      filters.features!.every((f) =>
        p.features.some((pf) => pf.toLowerCase().includes(f.toLowerCase()))
      )
    )
  }
  if (filters.brand?.length) {
    results = results.filter((p) =>
      filters.brand!.some((b) => p.brand.toLowerCase() === b.toLowerCase())
    )
  }

  return results.slice(0, filters.limit ?? 5)
}
