/**
 * Deterministic catalog generator.
 *
 * Produces ~500 SKUs across 7 categories and writes data/catalog.json.
 * Uses a seeded PRNG so IDs, prices, ratings, and stock quantities are
 * reproducible across runs — evals depend on this stability.
 *
 * Run: npm run seed
 */

import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import type { Product } from "../lib/types"

// ---- seeded PRNG (mulberry32) ----
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(20260702)
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]
const range = (min: number, max: number) => min + rand() * (max - min)
const int = (min: number, max: number) => Math.floor(range(min, max + 1))
const chance = (p: number) => rand() < p

// ---- subcategory templates ----

type Template = {
  category: string
  subcategory: string
  brands: readonly string[]
  nameFmt: (brand: string, model: string) => string
  priceRange: [number, number]
  features: () => string[]
  specs: () => Record<string, string>
}

const POWER_BRANDS = ["Makita", "Milwaukee", "DeWalt", "Bosch", "Ryobi", "Ozito", "Metabo"] as const
const HAND_BRANDS = ["Stanley", "Irwin", "Bahco", "Sidchrome", "Fuller", "Trojan", "Stahlwille"] as const
const FASTENER_BRANDS = ["Zenith", "Buildex", "Ramset", "Otter", "Pinnacle"] as const
const PLUMB_BRANDS = ["Reece", "Pope", "Holman", "Nylex", "Caroma"] as const
const ELEC_BRANDS = ["HPM", "Clipsal", "Legrand", "Olex", "Prysmian"] as const
const PAINT_BRANDS = ["Dulux", "Taubmans", "Wattyl", "British Paints", "Haymes"] as const
const GARDEN_BRANDS = ["Hoselink", "Nylex", "Pope", "Gardena", "Yates", "Scotts"] as const

const model = () => {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"
  const l1 = letters[int(0, letters.length - 1)]
  const l2 = letters[int(0, letters.length - 1)]
  const n = int(100, 9999)
  return `${l1}${l2}${n}`
}

const voltages = ["12V", "18V", "20V", "36V", "40V"] as const
// weighted picker mirroring rough real-world market share for cordless power tools
const pickVoltage = () => {
  const r = rand()
  if (r < 0.45) return "18V"
  if (r < 0.75) return "20V"
  if (r < 0.88) return "12V"
  if (r < 0.95) return "36V"
  return "40V"
}
const chuck = ["10mm", "13mm"] as const
const bladeSize = ["165mm", "184mm", "190mm", "235mm"] as const
const sanderPad = ["125mm", "150mm"] as const
const grinderDisc = ["100mm", "115mm", "125mm", "230mm"] as const

const drillFeatures = () => {
  const f = [pickVoltage(), "cordless"]
  if (chance(0.6)) f.push("brushless")
  if (chance(0.5)) f.push("variable-speed")
  if (chance(0.4)) f.push("hammer-action")
  if (chance(0.3)) f.push("led-light")
  return f
}

const sawFeatures = () => {
  const f: string[] = []
  if (chance(0.7)) f.push(pickVoltage())
  f.push(chance(0.7) ? "cordless" : "corded")
  if (chance(0.5)) f.push("brushless")
  if (chance(0.4)) f.push("laser-guide")
  if (chance(0.4)) f.push("dust-port")
  return f
}

const sanderFeatures = () => {
  const f: string[] = []
  if (chance(0.6)) f.push(pickVoltage())
  f.push(chance(0.6) ? "cordless" : "corded")
  if (chance(0.5)) f.push("variable-speed")
  if (chance(0.6)) f.push("dust-collection")
  return f
}

const grinderFeatures = () => {
  const f: string[] = []
  if (chance(0.5)) f.push(pickVoltage())
  f.push(chance(0.5) ? "cordless" : "corded")
  if (chance(0.6)) f.push("brushless")
  if (chance(0.5)) f.push("paddle-switch")
  if (chance(0.4)) f.push("anti-vibration")
  return f
}

const impactFeatures = () => {
  const f = [pickVoltage(), "cordless", "impact"]
  if (chance(0.7)) f.push("brushless")
  if (chance(0.5)) f.push("variable-speed")
  return f
}

const TEMPLATES: Template[] = [
  // ---------- power tools ----------
  {
    category: "power-tools",
    subcategory: "drill",
    brands: POWER_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Cordless Drill Driver`,
    priceRange: [79, 399],
    features: drillFeatures,
    specs: () => ({ chuck: pick(chuck), weight: `${range(1.2, 2.4).toFixed(1)}kg` }),
  },
  {
    category: "power-tools",
    subcategory: "impact-driver",
    brands: POWER_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Impact Driver`,
    priceRange: [99, 349],
    features: impactFeatures,
    specs: () => ({ torque: `${int(100, 220)}Nm`, weight: `${range(1.0, 1.8).toFixed(1)}kg` }),
  },
  {
    category: "power-tools",
    subcategory: "circular-saw",
    brands: POWER_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Circular Saw`,
    priceRange: [119, 549],
    features: sawFeatures,
    specs: () => ({ blade: pick(bladeSize), weight: `${range(2.5, 4.5).toFixed(1)}kg` }),
  },
  {
    category: "power-tools",
    subcategory: "reciprocating-saw",
    brands: POWER_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Reciprocating Saw`,
    priceRange: [129, 499],
    features: sawFeatures,
    specs: () => ({ stroke: `${int(20, 32)}mm`, weight: `${range(2.4, 4.0).toFixed(1)}kg` }),
  },
  {
    category: "power-tools",
    subcategory: "jigsaw",
    brands: POWER_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Jigsaw`,
    priceRange: [89, 349],
    features: sawFeatures,
    specs: () => ({ stroke: `${int(20, 28)}mm`, weight: `${range(1.8, 3.0).toFixed(1)}kg` }),
  },
  {
    category: "power-tools",
    subcategory: "sander",
    brands: POWER_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Random Orbital Sander`,
    priceRange: [69, 299],
    features: sanderFeatures,
    specs: () => ({ pad: pick(sanderPad), weight: `${range(1.2, 2.2).toFixed(1)}kg` }),
  },
  {
    category: "power-tools",
    subcategory: "grinder",
    brands: POWER_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Angle Grinder`,
    priceRange: [59, 449],
    features: grinderFeatures,
    specs: () => ({ disc: pick(grinderDisc), weight: `${range(1.6, 3.2).toFixed(1)}kg` }),
  },

  // ---------- hand tools ----------
  {
    category: "hand-tools",
    subcategory: "hammer",
    brands: HAND_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Claw Hammer`,
    priceRange: [15, 89],
    features: () => (chance(0.5) ? ["fibreglass-handle"] : ["wooden-handle"]),
    specs: () => ({ weight: `${pick(["16oz", "20oz", "24oz"] as const)}`, head: "steel" }),
  },
  {
    category: "hand-tools",
    subcategory: "screwdriver-set",
    brands: HAND_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Screwdriver Set`,
    priceRange: [19, 129],
    features: () => {
      const f = ["magnetic-tip"]
      if (chance(0.5)) f.push("insulated")
      return f
    },
    specs: () => ({ pieces: `${pick([6, 8, 10, 12] as const)}` }),
  },
  {
    category: "hand-tools",
    subcategory: "pliers",
    brands: HAND_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Combination Pliers`,
    priceRange: [12, 79],
    features: () => (chance(0.5) ? ["insulated"] : ["soft-grip"]),
    specs: () => ({ length: `${pick(["150mm", "180mm", "200mm", "250mm"] as const)}` }),
  },
  {
    category: "hand-tools",
    subcategory: "level",
    brands: HAND_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Spirit Level`,
    priceRange: [19, 149],
    features: () => (chance(0.4) ? ["magnetic"] : []),
    specs: () => ({ length: `${pick(["600mm", "900mm", "1200mm", "1800mm"] as const)}` }),
  },
  {
    category: "hand-tools",
    subcategory: "spanner-set",
    brands: HAND_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Combination Spanner Set`,
    priceRange: [39, 249],
    features: () => ["metric", "chrome-vanadium"],
    specs: () => ({ pieces: `${pick([8, 10, 12, 14] as const)}` }),
  },
  {
    category: "hand-tools",
    subcategory: "tape-measure",
    brands: HAND_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Tape Measure`,
    priceRange: [9, 49],
    features: () => (chance(0.4) ? ["magnetic-hook"] : []),
    specs: () => ({ length: `${pick(["5m", "8m", "10m"] as const)}` }),
  },

  // ---------- fasteners ----------
  {
    category: "fasteners",
    subcategory: "wood-screws",
    brands: FASTENER_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Wood Screws`,
    priceRange: [4, 39],
    features: () => ["countersunk", chance(0.5) ? "galvanised" : "zinc-plated"],
    specs: () => ({
      size: `${pick(["8g", "10g", "12g"] as const)} x ${pick(["25mm", "40mm", "50mm", "75mm"] as const)}`,
      pack: `${pick([50, 100, 200, 500] as const)}`,
    }),
  },
  {
    category: "fasteners",
    subcategory: "masonry-anchors",
    brands: FASTENER_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Masonry Anchors`,
    priceRange: [8, 59],
    features: () => ["expansion", "concrete"],
    specs: () => ({
      diameter: `${pick(["6mm", "8mm", "10mm", "12mm"] as const)}`,
      pack: `${pick([10, 25, 50] as const)}`,
    }),
  },
  {
    category: "fasteners",
    subcategory: "bolts",
    brands: FASTENER_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Hex Bolts`,
    priceRange: [6, 49],
    features: () => (chance(0.5) ? ["galvanised"] : ["stainless-steel"]),
    specs: () => ({
      size: `M${pick([6, 8, 10, 12] as const)} x ${pick([25, 40, 50, 75, 100] as const)}mm`,
      pack: `${pick([10, 20, 50] as const)}`,
    }),
  },
  {
    category: "fasteners",
    subcategory: "nails",
    brands: FASTENER_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Bullet Head Nails`,
    priceRange: [5, 29],
    features: () => (chance(0.5) ? ["galvanised"] : ["bright"]),
    specs: () => ({
      size: `${pick([50, 65, 75, 100] as const)}mm`,
      weight: `${pick(["500g", "1kg", "2.5kg"] as const)}`,
    }),
  },

  // ---------- plumbing ----------
  {
    category: "plumbing",
    subcategory: "tap",
    brands: PLUMB_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Mixer Tap`,
    priceRange: [79, 599],
    features: () => (chance(0.5) ? ["ceramic-disc", "wels-4-star"] : ["ceramic-disc"]),
    specs: () => ({ finish: pick(["chrome", "brushed-nickel", "matt-black"] as const) }),
  },
  {
    category: "plumbing",
    subcategory: "pipe",
    brands: PLUMB_BRANDS,
    nameFmt: (b, m) => `${b} ${m} PVC Pipe`,
    priceRange: [9, 89],
    features: () => (chance(0.4) ? ["pressure-rated"] : ["dwv"]),
    specs: () => ({
      diameter: `${pick(["20mm", "25mm", "32mm", "40mm", "50mm", "80mm", "100mm"] as const)}`,
      length: `${pick(["1m", "3m", "6m"] as const)}`,
    }),
  },
  {
    category: "plumbing",
    subcategory: "valve",
    brands: PLUMB_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Ball Valve`,
    priceRange: [12, 89],
    features: () => ["brass", "full-bore"],
    specs: () => ({ size: `${pick(["15mm", "20mm", "25mm", "32mm"] as const)}` }),
  },
  {
    category: "plumbing",
    subcategory: "showerhead",
    brands: PLUMB_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Shower Head`,
    priceRange: [39, 299],
    features: () => (chance(0.5) ? ["water-saving", "wels-3-star"] : ["adjustable-spray"]),
    specs: () => ({ finish: pick(["chrome", "brushed-nickel"] as const) }),
  },

  // ---------- electrical ----------
  {
    category: "electrical",
    subcategory: "cable",
    brands: ELEC_BRANDS,
    nameFmt: (b, m) => `${b} ${m} TPS Cable`,
    priceRange: [29, 449],
    features: () => ["copper", "twin-earth"],
    specs: () => ({
      size: `${pick(["1mm", "1.5mm", "2.5mm", "4mm", "6mm"] as const)}`,
      length: `${pick(["10m", "25m", "50m", "100m"] as const)}`,
    }),
  },
  {
    category: "electrical",
    subcategory: "switch",
    brands: ELEC_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Light Switch`,
    priceRange: [4, 39],
    features: () => (chance(0.4) ? ["dimmable"] : ["standard"]),
    specs: () => ({ gang: `${pick([1, 2, 3, 4] as const)}` }),
  },
  {
    category: "electrical",
    subcategory: "outlet",
    brands: ELEC_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Power Outlet`,
    priceRange: [6, 79],
    features: () => (chance(0.5) ? ["usb-charge"] : ["standard"]),
    specs: () => ({ gang: `${pick([1, 2] as const)}`, rating: "10A" }),
  },
  {
    category: "electrical",
    subcategory: "conduit",
    brands: ELEC_BRANDS,
    nameFmt: (b, m) => `${b} ${m} PVC Conduit`,
    priceRange: [6, 59],
    features: () => ["medium-duty"],
    specs: () => ({
      diameter: `${pick(["20mm", "25mm", "32mm", "40mm"] as const)}`,
      length: "4m",
    }),
  },

  // ---------- paint & prep ----------
  {
    category: "paint",
    subcategory: "primer",
    brands: PAINT_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Primer Sealer Undercoat`,
    priceRange: [39, 149],
    features: () => {
      const f: string[] = ["low-voc"]
      if (chance(0.5)) f.push("stain-blocking")
      if (chance(0.4)) f.push("bathroom-suitable")
      return f
    },
    specs: () => ({ volume: `${pick(["1L", "2L", "4L", "10L"] as const)}`, coverage: `${int(10, 16)}m²/L` }),
  },
  {
    category: "paint",
    subcategory: "topcoat",
    brands: PAINT_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Interior Wall Paint`,
    priceRange: [49, 199],
    features: () => {
      const f: string[] = ["low-voc", "washable"]
      if (chance(0.4)) f.push("mould-resistant")
      return f
    },
    specs: () => ({
      volume: `${pick(["1L", "4L", "10L", "15L"] as const)}`,
      finish: pick(["matt", "low-sheen", "semi-gloss", "gloss"] as const),
    }),
  },
  {
    category: "paint",
    subcategory: "exterior-paint",
    brands: PAINT_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Exterior Wall Paint`,
    priceRange: [79, 249],
    features: () => ["weather-resistant", "uv-protection"],
    specs: () => ({
      volume: `${pick(["4L", "10L", "15L"] as const)}`,
      finish: pick(["low-sheen", "semi-gloss"] as const),
    }),
  },
  {
    category: "paint",
    subcategory: "brush",
    brands: PAINT_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Paint Brush`,
    priceRange: [4, 39],
    features: () => (chance(0.4) ? ["synthetic-bristles"] : ["natural-bristles"]),
    specs: () => ({ width: `${pick(["25mm", "38mm", "50mm", "75mm", "100mm"] as const)}` }),
  },
  {
    category: "paint",
    subcategory: "roller",
    brands: PAINT_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Roller Kit`,
    priceRange: [9, 49],
    features: () => ["microfibre-sleeve"],
    specs: () => ({ width: `${pick(["180mm", "230mm", "270mm"] as const)}` }),
  },

  // ---------- garden ----------
  {
    category: "garden",
    subcategory: "hose",
    brands: GARDEN_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Garden Hose`,
    priceRange: [19, 199],
    features: () => (chance(0.4) ? ["kink-resistant", "uv-stabilised"] : ["kink-resistant"]),
    specs: () => ({ length: `${pick(["10m", "15m", "20m", "30m", "50m"] as const)}` }),
  },
  {
    category: "garden",
    subcategory: "irrigation",
    brands: GARDEN_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Drip Irrigation Kit`,
    priceRange: [29, 249],
    features: () => ["adjustable-flow"],
    specs: () => ({ zones: `${pick([1, 2, 4, 6] as const)}` }),
  },
  {
    category: "garden",
    subcategory: "soil",
    brands: GARDEN_BRANDS,
    nameFmt: (b, m) => `${b} ${m} Premium Potting Mix`,
    priceRange: [9, 39],
    features: () => ["organic", chance(0.5) ? "slow-release-fertiliser" : "moisture-retention"],
    specs: () => ({ volume: `${pick(["10L", "25L", "50L"] as const)}` }),
  },
  {
    category: "garden",
    subcategory: "fertiliser",
    brands: GARDEN_BRANDS,
    nameFmt: (b, m) => `${b} ${m} All-Purpose Fertiliser`,
    priceRange: [12, 79],
    features: () => (chance(0.5) ? ["slow-release"] : ["fast-acting"]),
    specs: () => ({ weight: `${pick(["1kg", "2.5kg", "5kg", "10kg"] as const)}` }),
  },
]

// SKU-count distribution — sums to ~500
const COUNTS: Record<string, number> = {
  drill: 18,
  "impact-driver": 12,
  "circular-saw": 12,
  "reciprocating-saw": 10,
  jigsaw: 10,
  sander: 12,
  grinder: 16,

  hammer: 12,
  "screwdriver-set": 12,
  pliers: 14,
  level: 12,
  "spanner-set": 12,
  "tape-measure": 12,

  "wood-screws": 20,
  "masonry-anchors": 16,
  bolts: 18,
  nails: 16,

  tap: 18,
  pipe: 20,
  valve: 14,
  showerhead: 12,

  cable: 16,
  switch: 16,
  outlet: 16,
  conduit: 14,

  primer: 12,
  topcoat: 18,
  "exterior-paint": 12,
  brush: 14,
  roller: 12,

  hose: 14,
  irrigation: 12,
  soil: 14,
  fertiliser: 12,
}

function generate(): Product[] {
  const products: Product[] = []
  let idCounter = 1

  for (const tmpl of TEMPLATES) {
    const count = COUNTS[tmpl.subcategory] ?? 10
    for (let i = 0; i < count; i++) {
      const brand = pick(tmpl.brands)
      const m = model()
      const id = `prod-${String(idCounter).padStart(3, "0")}`
      const sku = `SKU-${brand.slice(0, 3).toUpperCase()}-${m}`
      const price = Math.round(range(tmpl.priceRange[0], tmpl.priceRange[1]))
      const inStock = chance(0.82)
      const qty = inStock ? int(1, 60) : 0
      products.push({
        id,
        sku,
        name: tmpl.nameFmt(brand, m),
        brand,
        category: tmpl.category,
        price,
        features: tmpl.features(),
        specs: { subcategory: tmpl.subcategory, ...tmpl.specs() },
        avg_rating: Math.round(range(3.4, 4.9) * 10) / 10,
        review_count: int(3, 480),
        in_stock: inStock,
        qty_on_hand: qty,
      })
      idCounter++
    }
  }
  return products
}

function main() {
  const products = generate()

  const dataDir = join(process.cwd(), "data")
  mkdirSync(dataDir, { recursive: true })
  const outPath = join(dataDir, "catalog.json")
  writeFileSync(outPath, JSON.stringify(products, null, 2))

  const byCategory = products.reduce<Record<string, number>>((acc, p) => {
    acc[p.category] = (acc[p.category] ?? 0) + 1
    return acc
  }, {})
  console.log(`Wrote ${products.length} products to ${outPath}`)
  for (const [cat, n] of Object.entries(byCategory)) console.log(`  ${cat}: ${n}`)
}

main()
