import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { KitItem, KitRole, ProjectKit, Product } from "../types"

/**
 * Budget-aware project kit assembler.
 *
 * Given a project (painting, garden, bathroom) and an optional total budget,
 * assemble a bundle of complementary products from the JSON catalog that stays
 * under the budget. Purely deterministic — no LLM, no embeddings. Same substrate
 * and ranking philosophy as productSearch (rating desc, then price asc).
 *
 * Strategy:
 *   1. Start every role at its cheapest candidate (the affordable floor).
 *   2. Drop optional roles first if even the essentials' floor blows the budget.
 *   3. Spend the remaining budget upgrading roles to higher-rated products.
 * This yields the best-rated kit that fits, or the cheapest essentials-only kit
 * when nothing fits (flagged with within_budget: false).
 */

export type KitProject = "painting" | "garden" | "bathroom"

let catalogCache: readonly Product[] | null = null

function loadCatalog(): readonly Product[] {
  if (catalogCache) return catalogCache
  const path = join(process.cwd(), "data", "catalog.json")
  catalogCache = Object.freeze(JSON.parse(readFileSync(path, "utf-8")) as Product[])
  return catalogCache
}

const byRatingThenPrice = (a: Product, b: Product) => {
  if (b.avg_rating !== a.avg_rating) return b.avg_rating - a.avg_rating
  if (a.price !== b.price) return a.price - b.price
  return a.id.localeCompare(b.id)
}

// --- Role configs. Each role.key is a catalog `specs.subcategory` value. ---

// Interior repaint: prime bare/patched surfaces, then two coats + applicators.
const INTERIOR_ROLES: KitRole[] = [
  { key: "topcoat", label: "Interior paint (topcoat)", essential: true },
  { key: "roller", label: "Roller", essential: true },
  { key: "brush", label: "Brush (cutting in)", essential: true },
  { key: "primer", label: "Primer / undercoat", essential: false },
]

// Exterior job (fence, deck, render): weatherproof paint carries the primer, so
// there's no separate undercoat role.
const EXTERIOR_ROLES: KitRole[] = [
  { key: "exterior-paint", label: "Exterior paint", essential: true },
  { key: "roller", label: "Roller", essential: true },
  { key: "brush", label: "Brush (cutting in)", essential: true },
]

// New garden bed: growing medium + feed + a way to water it. Drip irrigation is
// the nice-to-have that gets dropped first on a tight budget.
const GARDEN_ROLES: KitRole[] = [
  { key: "soil", label: "Soil / potting mix", essential: true },
  { key: "fertiliser", label: "Fertiliser", essential: true },
  { key: "hose", label: "Garden hose", essential: true },
  { key: "irrigation", label: "Drip irrigation kit", essential: false },
]

// Bathroom fixture refresh: the tap + showerhead are the visible swap; the
// shut-off valve and connecting pipe are optional extras for the job.
const BATHROOM_ROLES: KitRole[] = [
  { key: "tap", label: "Mixer tap", essential: true },
  { key: "showerhead", label: "Shower head", essential: true },
  { key: "valve", label: "Shut-off valve", essential: false },
  { key: "pipe", label: "Connecting pipe", essential: false },
]

const FLAT_ROLES: Record<Exclude<KitProject, "painting">, KitRole[]> = {
  garden: GARDEN_ROLES,
  bathroom: BATHROOM_ROLES,
}

const EXTERIOR_HINTS = ["exterior", "outdoor", "outside", "fence", "deck", "render", "weatherboard", "facade", "cladding"]

export function isExteriorProject(text: string): boolean {
  const t = text.toLowerCase()
  return EXTERIOR_HINTS.some((h) => t.includes(h))
}

// Keyword → project. Painting is checked first so "paint my bathroom" is a
// painting job, not a fixture swap. Returns null when nothing matches.
const PROJECT_HINTS: Array<[KitProject, string[]]> = [
  ["painting", ["paint", "repaint", "painting", "topcoat", "primer", "undercoat"]],
  ["garden", ["garden", "veggie", "vegetable patch", "planter", "plant bed", "raised bed", "flower bed", "irrigation", "fertilis", "fertiliz", "potting", "lawn"]],
  ["bathroom", ["bathroom", "ensuite", "shower", "showerhead", "mixer tap", "vanity", "fixture", " tap "]],
]

export function detectProject(text: string): KitProject | null {
  const t = ` ${text.toLowerCase()} `
  for (const [project, hints] of PROJECT_HINTS) {
    if (hints.some((h) => t.includes(h))) return project
  }
  return null
}

function rolesForProject(project: KitProject, exterior: boolean): KitRole[] {
  if (project === "painting") return exterior ? EXTERIOR_ROLES : INTERIOR_ROLES
  return FLAT_ROLES[project]
}

type BuildOpts = {
  project?: KitProject
  budget?: number | null
  exterior?: boolean
  brand?: string[]
}

export async function buildKit(opts: BuildOpts = {}): Promise<ProjectKit> {
  const project = opts.project ?? "painting"
  const budget = opts.budget ?? null
  const roles = rolesForProject(project, opts.exterior ?? false)
  const catalog = loadCatalog()

  // Candidate list per role, best-first (rating desc, then price asc). Optional
  // brand preference narrows candidates but never leaves a role empty — if the
  // brand has nothing for a role, fall back to the whole subcategory.
  const brandSet = opts.brand?.length ? new Set(opts.brand.map((b) => b.toLowerCase())) : null
  const candidatesFor = (roleKey: string): Product[] => {
    const all = catalog.filter((p) => (p.specs.subcategory ?? "") === roleKey)
    const filtered = brandSet ? all.filter((p) => brandSet.has(p.brand.toLowerCase())) : all
    return [...(filtered.length ? filtered : all)].sort(byRatingThenPrice)
  }

  const candidates = new Map<string, Product[]>()
  const availableRoles = roles.filter((r) => {
    const list = candidatesFor(r.key)
    if (list.length) candidates.set(r.key, list)
    return list.length > 0
  })

  const cheapest = (roleKey: string): Product =>
    [...candidates.get(roleKey)!].sort((a, b) => a.price - b.price || a.id.localeCompare(b.id))[0]

  // 1. Floor: cheapest option for every available role.
  const chosen = new Map<string, Product>()
  for (const r of availableRoles) chosen.set(r.key, cheapest(r.key))

  const skipped: ProjectKit["skipped"] = []
  const sumChosen = () =>
    [...chosen.values()].reduce((s, p) => s + p.price, 0)

  // 2. If a budget is set and the floor overshoots, drop optional roles
  //    (cheapest-first isn't the point — essentials must survive).
  if (budget !== null) {
    const optional = availableRoles.filter((r) => !r.essential)
    for (const r of optional) {
      if (sumChosen() <= budget) break
      chosen.delete(r.key)
      skipped.push({
        label: r.label,
        reason: `Dropped to keep the kit under $${budget}.`,
      })
    }
  }

  // 3. Upgrade: spend leftover budget on higher-rated products, essentials
  //    first. Without a budget, jump straight to each role's best-rated pick.
  const order = availableRoles.filter((r) => chosen.has(r.key))
  for (const r of order) {
    const list = candidates.get(r.key)!
    if (budget === null) {
      chosen.set(r.key, list[0]) // best-rated outright
      continue
    }
    const current = chosen.get(r.key)!
    const remaining = budget - sumChosen()
    const ceil = current.price + remaining
    const best = list.find((p) => p.price <= ceil) // list is best-first
    if (best) chosen.set(r.key, best)
  }

  const items: KitItem[] = order.map((r) => {
    const product = chosen.get(r.key)!
    const best = candidates.get(r.key)![0]
    const reason =
      product.id === best.id
        ? `Top-rated ${r.label.toLowerCase()} (${product.avg_rating}★).`
        : `Best value ${r.label.toLowerCase()} within budget.`
    return { role: r.key, label: r.label, product, reason }
  })

  const total = items.reduce((s, it) => s + it.product.price, 0)
  const within_budget = budget === null ? true : total <= budget

  let note: string | undefined
  if (budget !== null && !within_budget) {
    note = `Even the cheapest essentials come to $${total}, which is over the $${budget} budget. Consider raising the budget or a smaller project scope.`
  }

  return { project, budget, total, within_budget, items, skipped, note }
}

/** Back-compat thin wrapper — painting kits. Prefer buildKit for new callers. */
export async function buildPaintingKit(
  opts: Omit<BuildOpts, "project"> = {},
): Promise<ProjectKit> {
  return buildKit({ ...opts, project: "painting" })
}
