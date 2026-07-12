import { existsSync } from "node:fs"
import { join } from "node:path"
import { openai } from "@ai-sdk/openai"
import { generateText } from "ai"
import { howToRag } from "../lib/tools/how-to-rag"

const envPath = join(process.cwd(), ".env.local")
if (existsSync(envPath)) process.loadEnvFile(envPath)

const cases = [
  { q: "How do I tile a bathroom floor?", concepts: ["waterproofing", "adhesive", "grout", "spacers"] },
  { q: "What's the best way to prep a wall before painting?", concepts: ["sugar soap", "filler", "sand", "primer"] },
  { q: "How much gap should I leave between deck boards?", concepts: ["gap", "drainage", "thermal movement"] },
  { q: "Can I install laminate flooring over concrete?", concepts: ["moisture", "underlay", "expansion gap", "acclimatisation"] },
]

async function main() {
  for (const c of cases) {
    const rag = await howToRag(c.q)
    console.log("\n" + "=".repeat(70))
    console.log("Q:", c.q)
    console.log("Retrieved:")
    for (const s of rag.sources) console.log("  " + s.score.toFixed(3) + " | " + s.title)
    const ctx = rag.sources.map((s) => `[${s.title}]\n${s.chunk}`).join("\n\n")
    const gen = await generateText({
      model: openai("gpt-4o-mini"),
      system:
        "You are a helpful hardware and home-improvement store assistant. Answer based ONLY on the following guide excerpts. If the excerpts don't cover the question, say so. Do not invent facts.\n\n" +
        ctx,
      prompt: c.q,
    })
    console.log("\nAnswer:\n" + gen.text)
    console.log("\nRequired concepts:", c.concepts.join(", "))
  }
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
