import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it, expect } from "vitest"
import {
  buildKit,
  buildPaintingKit,
  detectProject,
  isExteriorProject,
} from "../lib/tools/project-kit"
import type { Product } from "../lib/types"

/**
 * Deterministic checks on the budget-aware painting kit assembler. No LLM — the
 * builder is pure catalog logic, so these assert the SPEC-level guarantees:
 * stays under budget when it can, keeps essentials, and never invents products.
 */

const catalog: Product[] = JSON.parse(
  readFileSync(join(process.cwd(), "data", "catalog.json"), "utf-8"),
) as Product[]
const catalogById = new Map(catalog.map((p) => [p.id, p]))

describe("painting project kit", () => {
  it("interior kit under a generous budget covers all four roles and fits", async () => {
    const kit = await buildPaintingKit({ budget: 400 })
    const roles = kit.items.map((it) => it.role).sort()
    expect(roles).toEqual(["brush", "primer", "roller", "topcoat"])
    expect(kit.total).toBeLessThanOrEqual(400)
    expect(kit.within_budget).toBe(true)
    expect(kit.skipped).toHaveLength(0)
  })

  it("respects a tight budget by dropping optional roles before essentials", async () => {
    const kit = await buildPaintingKit({ budget: 120 })
    // essentials (topcoat, roller, brush) must survive; primer is optional.
    const roleSet = new Set(kit.items.map((it) => it.role))
    expect(roleSet.has("topcoat")).toBe(true)
    expect(roleSet.has("roller")).toBe(true)
    expect(roleSet.has("brush")).toBe(true)
    if (kit.within_budget) {
      expect(kit.total).toBeLessThanOrEqual(120)
    }
  })

  it("never exceeds the budget when a fitting combination exists", async () => {
    for (const budget of [150, 200, 250, 300]) {
      const kit = await buildPaintingKit({ budget })
      expect(kit.within_budget, `budget ${budget}`).toBe(true)
      expect(kit.total, `budget ${budget} total`).toBeLessThanOrEqual(budget)
    }
  })

  it("flags within_budget=false and keeps essentials when even the floor overshoots", async () => {
    const kit = await buildPaintingKit({ budget: 1 })
    expect(kit.within_budget).toBe(false)
    expect(kit.note).toBeTruthy()
    expect(kit.items.length).toBeGreaterThan(0) // still returns the cheapest essentials
  })

  it("exterior projects use exterior-paint and no separate primer", async () => {
    expect(isExteriorProject("help me paint my back fence")).toBe(true)
    expect(isExteriorProject("repaint my bedroom")).toBe(false)
    const kit = await buildPaintingKit({ budget: 400, exterior: true })
    const roles = new Set(kit.items.map((it) => it.role))
    expect(roles.has("exterior-paint")).toBe(true)
    expect(roles.has("primer")).toBe(false)
  })

  it("no_hallucination — every kit item is a real catalog product", async () => {
    const kit = await buildPaintingKit({ budget: 200 })
    for (const it of kit.items) {
      const real = catalogById.get(it.product.id)
      expect(real, `${it.product.id} not in catalog`).toBeTruthy()
      expect(real!.price).toBe(it.product.price)
    }
  })

  it("without a budget, picks the top-rated product per role", async () => {
    const kit = await buildPaintingKit({})
    expect(kit.budget).toBeNull()
    expect(kit.within_budget).toBe(true)
    for (const it of kit.items) {
      const bestRating = Math.max(
        ...catalog
          .filter((p) => (p.specs.subcategory ?? "") === it.role)
          .map((p) => p.avg_rating),
      )
      expect(it.product.avg_rating, `${it.role} should be top-rated`).toBe(bestRating)
    }
  })
})

describe("garden bed kit", () => {
  it("covers all four roles under a generous budget and fits", async () => {
    const kit = await buildKit({ project: "garden", budget: 400 })
    expect(kit.project).toBe("garden")
    expect(kit.items.map((it) => it.role).sort()).toEqual([
      "fertiliser",
      "hose",
      "irrigation",
      "soil",
    ])
    expect(kit.total).toBeLessThanOrEqual(400)
    expect(kit.within_budget).toBe(true)
  })

  it("keeps essentials and drops irrigation on a tight budget", async () => {
    const kit = await buildKit({ project: "garden", budget: 120 })
    const roles = new Set(kit.items.map((it) => it.role))
    expect(roles.has("soil")).toBe(true)
    expect(roles.has("fertiliser")).toBe(true)
    expect(roles.has("hose")).toBe(true)
    if (kit.within_budget) expect(kit.total).toBeLessThanOrEqual(120)
  })

  it("no_hallucination — every item is a real catalog product", async () => {
    const kit = await buildKit({ project: "garden", budget: 250 })
    for (const it of kit.items) {
      const real = catalogById.get(it.product.id)
      expect(real, `${it.product.id} not in catalog`).toBeTruthy()
      expect(real!.category).toBe("garden")
    }
  })
})

describe("bathroom fixture kit", () => {
  it("covers all four roles under a generous budget and fits", async () => {
    const kit = await buildKit({ project: "bathroom", budget: 600 })
    expect(kit.project).toBe("bathroom")
    expect(kit.items.map((it) => it.role).sort()).toEqual([
      "pipe",
      "showerhead",
      "tap",
      "valve",
    ])
    expect(kit.total).toBeLessThanOrEqual(600)
    expect(kit.within_budget).toBe(true)
  })

  it("keeps tap + showerhead essentials on a tight budget", async () => {
    const kit = await buildKit({ project: "bathroom", budget: 200 })
    const roles = new Set(kit.items.map((it) => it.role))
    expect(roles.has("tap")).toBe(true)
    expect(roles.has("showerhead")).toBe(true)
    if (kit.within_budget) expect(kit.total).toBeLessThanOrEqual(200)
  })

  it("no_hallucination — every item is a real catalog product", async () => {
    const kit = await buildKit({ project: "bathroom", budget: 300 })
    for (const it of kit.items) {
      const real = catalogById.get(it.product.id)
      expect(real, `${it.product.id} not in catalog`).toBeTruthy()
      expect(real!.category).toBe("plumbing")
    }
  })
})

describe("project detection", () => {
  const cases: Array<[string, ReturnType<typeof detectProject>]> = [
    ["What do I need to paint my bedroom?", "painting"],
    ["help me paint my back fence", "painting"],
    ["paint my bathroom for under $150", "painting"], // paint wins over bathroom
    ["set up a raised veggie garden bed", "garden"],
    ["I want to fertilise my new flower bed", "garden"],
    ["refresh my bathroom fixtures", "bathroom"],
    ["replace my shower head and mixer tap", "bathroom"],
    ["what's the weather", null],
  ]
  for (const [query, expected] of cases) {
    it(`"${query}" → ${expected}`, () => {
      expect(detectProject(query)).toBe(expected)
    })
  }

  it("buildPaintingKit wrapper still returns a painting kit", async () => {
    const kit = await buildPaintingKit({ budget: 200 })
    expect(kit.project).toBe("painting")
  })
})
