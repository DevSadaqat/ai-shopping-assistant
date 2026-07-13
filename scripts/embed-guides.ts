import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { openai } from "@ai-sdk/openai"
import { embedMany } from "ai"

// Load .env.local so OPENAI_API_KEY is available when running via tsx.
const envPath = join(process.cwd(), ".env.local")
if (existsSync(envPath)) process.loadEnvFile(envPath)

const GUIDES_DIR = join(process.cwd(), "data", "guides")
const OUT_PATH = join(process.cwd(), "data", "guides.embed.json")
const EMBED_MODEL = "text-embedding-3-small"

// Chunking targets: ~400 tokens with ~50 token overlap at paragraph boundaries
// (SPEC § "How-to guide corpus"). We approximate tokens as chars/4 — good
// enough at this scale and avoids pulling in a tokenizer dependency.
const TARGET_CHARS = 1600
const OVERLAP_CHARS = 200

type Chunk = {
  guide: string
  guide_title: string
  section: string
  chunk_index: number
  text: string
  approx_tokens: number
}

type EmbeddedChunk = Chunk & { embedding: number[] }

function chunkGuide(file: string, raw: string): Chunk[] {
  const lines = raw.split("\n")
  let guideTitle = file.replace(/\.md$/, "")
  let section = ""

  const blocks: { section: string; text: string }[] = []
  let paraLines: string[] = []

  const flushPara = () => {
    const t = paraLines.join("\n").trim()
    if (t) blocks.push({ section, text: t })
    paraLines = []
  }

  for (const line of lines) {
    if (line.startsWith("# ") && !guideTitle.includes(" ")) {
      guideTitle = line.slice(2).trim()
      flushPara()
      continue
    }
    if (line.startsWith("## ")) {
      flushPara()
      section = line.slice(3).trim()
      continue
    }
    if (line.trim() === "") {
      flushPara()
      continue
    }
    paraLines.push(line)
  }
  flushPara()

  // Greedy paragraph aggregation up to TARGET_CHARS. When a chunk closes,
  // seed the next one with the tail of the current one for OVERLAP_CHARS
  // worth of context — helps queries that land on a chunk boundary.
  const chunks: Chunk[] = []
  let buf = ""
  let bufSection = blocks[0]?.section ?? ""
  let chunkIndex = 0

  const emit = () => {
    if (!buf.trim()) return
    chunks.push({
      guide: file,
      guide_title: guideTitle,
      section: bufSection,
      chunk_index: chunkIndex++,
      text: buf.trim(),
      approx_tokens: Math.round(buf.length / 4),
    })
    // Carry the trailing OVERLAP_CHARS forward as seed for next chunk.
    buf = buf.length > OVERLAP_CHARS ? buf.slice(-OVERLAP_CHARS) : ""
  }

  for (const block of blocks) {
    // If the section changed and we already have content, close the chunk
    // so a chunk never straddles two sections.
    if (block.section !== bufSection && buf.trim()) {
      emit()
      bufSection = block.section
    }
    if (buf) buf += "\n\n"
    buf += block.text
    if (buf.length >= TARGET_CHARS) emit()
  }
  emit()
  return chunks
}

async function main() {
  const files = readdirSync(GUIDES_DIR).filter((f) => f.endsWith(".md")).sort()
  if (files.length === 0) {
    console.error(`No guides found in ${GUIDES_DIR}`)
    process.exit(1)
  }

  const allChunks: Chunk[] = []
  for (const f of files) {
    const raw = readFileSync(join(GUIDES_DIR, f), "utf-8")
    const chunks = chunkGuide(f, raw)
    console.log(`${f}: ${chunks.length} chunks`)
    allChunks.push(...chunks)
  }
  console.log(`Total: ${allChunks.length} chunks. Embedding with ${EMBED_MODEL}…`)

  const { embeddings, usage } = await embedMany({
    model: openai.embedding(EMBED_MODEL),
    values: allChunks.map((c) => c.text),
  })

  if (embeddings.length !== allChunks.length) {
    throw new Error(`embedding count mismatch: ${embeddings.length} vs ${allChunks.length}`)
  }

  const embedded: EmbeddedChunk[] = allChunks.map((c, i) => ({
    ...c,
    embedding: embeddings[i],
  }))

  writeFileSync(OUT_PATH, JSON.stringify(embedded))
  console.log(`Wrote ${embedded.length} embedded chunks to ${OUT_PATH}`)
  console.log(`Tokens used: ${usage?.tokens ?? "?"}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
