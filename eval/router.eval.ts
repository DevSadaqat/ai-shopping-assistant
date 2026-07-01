import { describe, it, expect } from "vitest"
import { classifyIntent } from "../lib/router"
import goldenCases from "./golden/router.json"

describe("intent router", () => {
  for (const tc of goldenCases) {
    it(`[${tc.id}] routes "${tc.query}" → ${tc.expected}`, async () => {
      const { intent } = await classifyIntent(tc.query)
      expect(intent).toBe(tc.expected)
    }, 15_000)
  }
})
