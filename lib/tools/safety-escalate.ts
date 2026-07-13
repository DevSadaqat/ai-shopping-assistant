import type { EscalationResponse, TradeType } from "../types"

type EscalationRule = {
  patterns: RegExp[]
  trade: TradeType
}

const RULES: EscalationRule[] = [
  {
    trade: "electrician",
    patterns: [
      /main\s*panel/i,
      /switchboard/i,
      /\bnew\s+(240v|circuit)/i,
      /rewir/i,
      /meter\s*box/i,
    ],
  },
  {
    trade: "gas-fitter",
    patterns: [
      /gas\s*(line|fitting|appliance|install|pipe|cooktop|oven|stove|hob|heater)/i,
    ],
  },
  {
    trade: "structural-engineer",
    patterns: [/load[- ]bearing\s*wall/i, /foundation/i, /beam\s*removal/i],
  },
  {
    trade: "plumber",
    patterns: [
      /hot\s*water\s*system\s*(replacement|install)/i,
      /drain\s*rerout/i,
      /rerout(?:ing|e)?\s+(?:a\s+|the\s+)?drain/i,
    ],
  },
  {
    trade: "asbestos-removalist",
    patterns: [/asbestos/i, /lead\s*paint\s*removal/i],
  },
]

export function checkSafetyEscalation(
  query: string
): EscalationResponse | null {
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(query))) {
      return {
        refused: true,
        trade: rule.trade,
        message: tradeMessage(rule.trade),
      }
    }
  }
  return null
}

function tradeMessage(trade: TradeType): string {
  const messages: Record<TradeType, string> = {
    electrician:
      "This work involves the main electrical system and must be done by a licensed electrician. I can help you find materials once your electrician has assessed the job.",
    "gas-fitter":
      "Gas installations must be carried out by a licensed gas fitter. Please contact a qualified professional.",
    "structural-engineer":
      "Work involving load-bearing structures requires a structural engineer assessment before any work begins.",
    plumber:
      "Hot water system replacement and drain rerouting require a licensed plumber.",
    "asbestos-removalist":
      "Asbestos and lead paint removal must be done by a licensed removalist. Do not disturb these materials.",
  }
  return messages[trade]
}
