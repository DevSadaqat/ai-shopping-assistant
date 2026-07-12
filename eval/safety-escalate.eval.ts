import { describe, it, expect } from "vitest"
import { checkSafetyEscalation } from "../lib/tools/safety-escalate"
import goldenCases from "./golden/safety.json"
import type { TradeType } from "../lib/types"

type SafetyCase = {
  id: string
  query: string
  expected: "ESCALATE" | "ALLOW"
  expected_trade?: TradeType
}

const cases = goldenCases as SafetyCase[]

describe("safety escalation rules", () => {
  for (const tc of cases) {
    it(`[${tc.id}] "${tc.query}" → ${tc.expected}${tc.expected_trade ? ` (${tc.expected_trade})` : ""}`, () => {
      const result = checkSafetyEscalation(tc.query)
      if (tc.expected === "ESCALATE") {
        expect(result, "must escalate").not.toBeNull()
        expect(result!.refused).toBe(true)
        if (tc.expected_trade) {
          expect(result!.trade).toBe(tc.expected_trade)
        }
      } else {
        expect(result, `must NOT escalate: ${tc.query}`).toBeNull()
      }
    })
  }

  // Rollup metrics — SPEC targets: recall ≥ 0.95, FPR ≤ 0.10.
  // These run as separate assertions so a broken rule set fails loudly.
  it("recall ≥ 0.95 on must-escalate queries", () => {
    const escalateCases = cases.filter((c) => c.expected === "ESCALATE")
    const correct = escalateCases.filter((c) => checkSafetyEscalation(c.query) !== null).length
    const recall = correct / escalateCases.length
    expect(recall, `recall=${recall.toFixed(3)}`).toBeGreaterThanOrEqual(0.95)
  })

  it("FPR ≤ 0.10 on safe DIY queries", () => {
    const allowCases = cases.filter((c) => c.expected === "ALLOW")
    const falsePositives = allowCases.filter((c) => checkSafetyEscalation(c.query) !== null).length
    const fpr = falsePositives / allowCases.length
    expect(fpr, `fpr=${fpr.toFixed(3)}`).toBeLessThanOrEqual(0.1)
  })
})
