import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it, expect } from "vitest"
import { planTurn, type TurnDeps } from "./turn"
import type { HowToResult, Product, ProductFilters, RouterResult } from "./types"

const catalog = JSON.parse(
  readFileSync(join(process.cwd(), "data", "catalog.json"), "utf-8"),
) as Product[]

// Scripted stand-ins for the model-backed dependencies. The catalog-backed
// tools (product search, project kit, stock check) and the safety rules run
// for real.
function deps(script: {
  router?: RouterResult | (() => never)
  filters?: ProductFilters | (() => never)
  guides?: HowToResult
}): TurnDeps {
  return {
    classifyIntent: async () => {
      if (typeof script.router === "function") return script.router()
      if (!script.router) throw new Error("router should not be called")
      return script.router
    },
    extractFilters: async () => {
      if (typeof script.filters === "function") return script.filters()
      return script.filters ?? {}
    },
    retrieveGuides: async () => {
      if (!script.guides) throw new Error("guide retrieval should not be called")
      return script.guides
    },
  }
}

describe("planTurn", () => {
  it("answers a licensed-trade request with a rule refusal, without consulting the router", async () => {
    const plan = await planTurn("I want to rewire my whole house", deps({}))

    expect(plan.kind).toBe("fixed")
    if (plan.kind !== "fixed") return
    expect(plan.path).toBe("safety_rule_refused")
    expect(plan.text).toContain("licensed electrician")
  })

  it("asks a clarifying question on the light tier when the router is unsure", async () => {
    const plan = await planTurn(
      "something for the garage",
      deps({ router: { intent: "PRODUCT_SEARCH", confidence: "low" } }),
    )

    expect(plan.kind).toBe("generate")
    if (plan.kind !== "generate") return
    expect(plan.path).toBe("generator:clarify")
    expect(plan.tier).toBe("light")
    expect(plan.cards).toBeNull()
    expect(plan.system).toContain("Ask one focused clarifying question")
  })

  it("fails closed: gives a soft refusal even when the router is unsure about licensed-trade work", async () => {
    const plan = await planTurn(
      "can I move the power point behind my oven",
      deps({ router: { intent: "SAFETY_ESCALATE", confidence: "low" } }),
    )

    expect(plan.kind).toBe("fixed")
    if (plan.kind !== "fixed") return
    expect(plan.path).toBe("safety_router_refused")
  })

  it("gives a soft refusal when the router is sure it's licensed-trade work no rule caught", async () => {
    const plan = await planTurn(
      "can I move the power point behind my oven",
      deps({ router: { intent: "SAFETY_ESCALATE", confidence: "high" } }),
    )

    expect(plan.kind).toBe("fixed")
    if (plan.kind !== "fixed") return
    expect(plan.path).toBe("safety_router_refused")
    expect(plan.text).toContain("licensed trade")
  })

  it("asks which project the customer means when a project kit request names no supported project", async () => {
    const plan = await planTurn(
      "what do I need to build a treehouse",
      deps({ router: { intent: "PROJECT_KIT", confidence: "high" } }),
    )

    expect(plan.kind).toBe("fixed")
    if (plan.kind !== "fixed") return
    expect(plan.path).toBe("project_kit_clarify")
    expect(plan.text).toContain("painting a room, a garden bed, or a bathroom fixture refresh")
  })

  it("builds an exterior painting kit within the budget the customer stated", async () => {
    const plan = await planTurn(
      "help me paint my back fence for under $200",
      deps({
        router: { intent: "PROJECT_KIT", confidence: "high" },
        filters: { price_max: 200 },
      }),
    )

    expect(plan.kind).toBe("generate")
    if (plan.kind !== "generate") return
    expect(plan.path).toBe("generator:project_kit")
    expect(plan.tier).toBe("premium")
    expect(plan.system).toContain("Project kit (painting, exterior)")
    expect(plan.cards?.kind).toBe("kit")
    if (plan.cards?.kind !== "kit") return
    expect(plan.cards.kit.budget).toBe(200)
    const roles = plan.cards.kit.items.map((it) => it.role)
    expect(roles).toContain("exterior-paint")
    expect(roles).not.toContain("primer")
  })

  it("shows matching products as cards and asks the premium tier for a short pick", async () => {
    const plan = await planTurn(
      "DeWalt drill",
      deps({
        router: { intent: "PRODUCT_SEARCH", confidence: "high" },
        filters: { subcategory: ["drill"], brand: ["DeWalt"] },
      }),
    )

    expect(plan.kind).toBe("generate")
    if (plan.kind !== "generate") return
    expect(plan.path).toBe("generator:product_search")
    expect(plan.tier).toBe("premium")
    expect(plan.system).toContain("Do NOT re-list the products")
    expect(plan.cards?.kind).toBe("search")
    if (plan.cards?.kind !== "search") return
    expect(plan.cards.products.length).toBeGreaterThan(0)
    expect(plan.cards.products.length).toBeLessThanOrEqual(5)
    for (const p of plan.cards.products) {
      expect(p.brand).toBe("DeWalt")
      expect(p.specs.subcategory).toBe("drill")
      expect(plan.system).toContain(p.id)
    }
  })

  it("asks the customer to broaden the search on the light tier when nothing matches", async () => {
    const plan = await planTurn(
      "a drill for under a dollar",
      deps({
        router: { intent: "PRODUCT_SEARCH", confidence: "high" },
        filters: { subcategory: ["drill"], price_max: 1 },
      }),
    )

    expect(plan.kind).toBe("generate")
    if (plan.kind !== "generate") return
    expect(plan.path).toBe("generator:product_search")
    expect(plan.tier).toBe("light")
    expect(plan.cards).toBeNull()
    expect(plan.system).toContain("No products matched")
    expect(plan.system).toContain('"price_max":1')
  })

  it("asks the customer to name the product when a stock check matches nothing", async () => {
    const plan = await planTurn(
      "is the Acme flux capacitor in stock",
      deps({
        router: { intent: "STOCK_CHECK", confidence: "high" },
        filters: { brand: ["Acme"] },
      }),
    )

    expect(plan.kind).toBe("generate")
    if (plan.kind !== "generate") return
    expect(plan.path).toBe("generator:stock_check")
    expect(plan.cards).toBeNull()
    expect(plan.system).toContain("could not identify which product")
  })

  it("puts the identified product's stock in the prompt when a stock check matches", async () => {
    const plan = await planTurn(
      "do you have DeWalt drills in stock",
      deps({
        router: { intent: "STOCK_CHECK", confidence: "high" },
        filters: { subcategory: ["drill"], brand: ["DeWalt"] },
      }),
    )

    expect(plan.kind).toBe("generate")
    if (plan.kind !== "generate") return
    expect(plan.path).toBe("generator:stock_check")
    const identified = plan.system.match(/Product identified: .+ \(([^)]+)\)/)?.[1]
    const dewaltDrillIds = catalog
      .filter((p) => p.brand === "DeWalt" && p.specs.subcategory === "drill")
      .map((p) => p.id)
    expect(dewaltDrillIds).toContain(identified)
    expect(plan.system).toContain(`"product_id":"${identified}"`)
    expect(plan.system).toContain('"qty_on_hand"')
  })

  it("grounds a how-to answer in the retrieved guide excerpts", async () => {
    const plan = await planTurn(
      "how do I grout tiles",
      deps({
        router: { intent: "HOW_TO", confidence: "high" },
        guides: {
          answer: "",
          needs_clarification: false,
          sources: [
            { title: "Tiling — Grouting", chunk: "Mix grout to a peanut-butter consistency.", score: 0.9 },
            { title: "Tiling — Sealing", chunk: "Seal grout after 72 hours.", score: 0.8 },
          ],
        },
      }),
    )

    expect(plan.kind).toBe("generate")
    if (plan.kind !== "generate") return
    expect(plan.path).toBe("generator:how_to")
    expect(plan.tier).toBe("premium")
    expect(plan.cards).toBeNull()
    expect(plan.system).toContain("Answer based only on the following guide excerpts")
    expect(plan.system).toContain(
      "[Tiling — Grouting]\nMix grout to a peanut-butter consistency.\n\n[Tiling — Sealing]\nSeal grout after 72 hours.",
    )
  })

  it("apologises with a fixed reply when the router fails", async () => {
    const plan = await planTurn(
      "find me a drill",
      deps({
        router: () => {
          throw new Error("router down")
        },
      }),
    )

    expect(plan.kind).toBe("fixed")
    if (plan.kind !== "fixed") return
    expect(plan.path).toBe("router_error")
    expect(plan.text).toContain("could you rephrase")
  })

  it("falls back to searching the customer's own words when filter extraction fails", async () => {
    const plan = await planTurn(
      "drill",
      deps({
        router: { intent: "PRODUCT_SEARCH", confidence: "high" },
        filters: () => {
          throw new Error("extractor down")
        },
      }),
    )

    expect(plan.kind).toBe("generate")
    if (plan.kind !== "generate") return
    expect(plan.system).toContain('Applied filters:\n{"query":"drill"}')
    expect(plan.cards?.kind).toBe("search")
    if (plan.cards?.kind !== "search") return
    expect(plan.cards.products.length).toBeGreaterThan(0)
    for (const p of plan.cards.products) {
      expect(`${p.name} ${p.category}`.toLowerCase()).toContain("drill")
    }
  })

  it("redirects an off-topic message with a fixed reply", async () => {
    const plan = await planTurn(
      "what's the weather today",
      deps({ router: { intent: "OFF_TOPIC", confidence: "high" } }),
    )

    expect(plan).toEqual({
      kind: "fixed",
      path: "off_topic",
      text: "I'm here to help with your shopping needs. What can I help you look for today?",
    })
  })
})
