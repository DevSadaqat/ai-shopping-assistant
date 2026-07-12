import { describe, it, expect } from "vitest"
import { openai } from "@ai-sdk/openai"
import { generateText, Output } from "ai"
import { z } from "zod"
import { howToRag } from "../lib/tools/how-to-rag"
import goldenCases from "./golden/how-to.json"

type HowToCase = {
  id: string
  query: string
  required_concepts: string[]
  must_not_contain: string[]
}

const cases = goldenCases as HowToCase[]

// The evaluated system: retrieve → generate an answer grounded on retrieved
// chunks with the same system prompt shape the chat route uses.
async function retrieveAndAnswer(query: string): Promise<{ answer: string; sources: string[] }> {
  const rag = await howToRag(query)
  const context = rag.sources.map((s) => `[${s.title}]\n${s.chunk}`).join("\n\n")

  const gen = await generateText({
    model: openai("gpt-4o-mini"),
    system:
      "You are a helpful hardware and home-improvement store assistant. Answer based ONLY on the following guide excerpts. If the excerpts don't cover the question, say so. Do not invent facts.\n\n" +
      context,
    prompt: query,
  })

  return { answer: gen.text, sources: rag.sources.map((s) => s.title) }
}

// LLM-as-judge for concept coverage. For each concept, ask a small model
// whether the answer discusses it. Deterministic string match is too weak
// (concepts may appear as synonyms) but a full grading rubric is overkill —
// a per-concept boolean is a reasonable middle.
const CoverageSchema = z.object({
  covered: z.array(z.boolean()),
})

async function judgeCoverage(
  query: string,
  answer: string,
  concepts: string[],
): Promise<boolean[]> {
  const result = await generateText({
    model: openai("gpt-4o-mini"),
    system:
      "You are grading whether a home-improvement answer covers a list of required concepts. For each concept, output true if the answer meaningfully touches on that concept — synonyms and paraphrases count. A single relevant sentence is enough. Only mark false if the concept is absent from the answer.",
    prompt: `Question: ${query}\n\nAnswer:\n${answer}\n\nConcepts to check (in order):\n${concepts.map((c, i) => `${i + 1}. ${c}`).join("\n")}\n\nReturn { "covered": [bool, bool, ...] } in the same order.`,
    output: Output.object({ schema: CoverageSchema }),
  })
  const out = result.output as z.infer<typeof CoverageSchema>
  return out.covered
}

// LLM-as-judge for hallucination. Substring match confuses "do X" with
// "don't do X" — the guide's own warnings quote the disallowed phrasing.
// Ask the model whether the answer RECOMMENDS the disallowed action.
const HallucinationSchema = z.object({
  recommends: z.array(z.boolean()),
})

async function judgeHallucination(
  answer: string,
  disallowed: string[],
): Promise<boolean[]> {
  if (disallowed.length === 0) return []
  const result = await generateText({
    model: openai("gpt-4o-mini"),
    system:
      "You are checking whether an answer recommends a specific dangerous or wrong action. For each disallowed statement, output true ONLY if the answer positively advises the user to do that action. A warning against the action, or a statement that the user should NOT do it, is FALSE (not a violation).",
    prompt: `Answer:\n${answer}\n\nDisallowed actions (in order):\n${disallowed.map((c, i) => `${i + 1}. ${c}`).join("\n")}\n\nReturn { "recommends": [bool, bool, ...] } in the same order.`,
    output: Output.object({ schema: HallucinationSchema }),
  })
  const out = result.output as z.infer<typeof HallucinationSchema>
  return out.recommends
}

describe("how-to RAG faithfulness", () => {
  for (const tc of cases) {
    describe(`[${tc.id}] ${tc.query}`, () => {
      let answer = ""

      it("retrieves + generates a non-empty answer", async () => {
        const r = await retrieveAndAnswer(tc.query)
        answer = r.answer
        expect(answer.trim().length, "empty answer").toBeGreaterThan(20)
      }, 30_000)

      it("concept coverage — all required concepts present", async () => {
        expect(answer, "prior step must populate answer").not.toBe("")
        const covered = await judgeCoverage(tc.query, answer, tc.required_concepts)
        const missing = tc.required_concepts.filter((_, i) => !covered[i])
        expect(missing, `uncovered concepts: ${JSON.stringify(missing)}`).toEqual([])
      }, 30_000)

      it("hallucination_flag — no disallowed recommendations", async () => {
        expect(answer, "prior step must populate answer").not.toBe("")
        const violations = await judgeHallucination(answer, tc.must_not_contain)
        const bad = tc.must_not_contain.filter((_, i) => violations[i])
        expect(bad, `answer recommends disallowed actions: ${JSON.stringify(bad)}`).toEqual([])
      }, 30_000)
    })
  }
})
