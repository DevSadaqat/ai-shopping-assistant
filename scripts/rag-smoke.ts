import { existsSync } from "node:fs"
import { join } from "node:path"
import { howToRag } from "../lib/tools/how-to-rag"

const envPath = join(process.cwd(), ".env.local")
if (existsSync(envPath)) process.loadEnvFile(envPath)

const queries = [
  "How do I tile a bathroom floor?",
  "What is the best way to prep a wall for painting?",
  "Can I install laminate over concrete?",
  "How do I unblock a drain?",
  "How much spacing between deck boards?",
  "Setting fence posts in concrete",
]

async function main() {
  for (const q of queries) {
    const r = await howToRag(q)
    console.log("\n> " + q)
    for (const s of r.sources) {
      console.log(`  ${s.score.toFixed(3)} | ${s.title}`)
    }
  }
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
