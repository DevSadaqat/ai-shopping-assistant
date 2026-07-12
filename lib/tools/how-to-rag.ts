import { readFileSync } from "node:fs"
import { join } from "node:path"
import { openai } from "@ai-sdk/openai"
import { embed } from "ai"
import type { HowToResult } from "../types"
import type { Tracer } from "../trace"

const EMBED_MODEL = "text-embedding-3-small"
const TOP_K = 3
const CANDIDATE_K = 10

type EmbeddedChunk = {
  guide: string
  guide_title: string
  section: string
  chunk_index: number
  text: string
  approx_tokens: number
  embedding: number[]
}

let corpusCache: EmbeddedChunk[] | null = null

function loadCorpus(): EmbeddedChunk[] {
  if (corpusCache) return corpusCache
  const path = join(process.cwd(), "data", "guides.embed.json")
  const parsed = JSON.parse(readFileSync(path, "utf-8")) as EmbeddedChunk[]
  corpusCache = parsed
  return parsed
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

function titleFor(chunk: EmbeddedChunk): string {
  return chunk.section ? `${chunk.guide_title} — ${chunk.section}` : chunk.guide_title
}

export async function howToRag(
  query: string,
  context?: string,
  tracer?: Tracer,
): Promise<HowToResult> {
  const corpus = loadCorpus()

  const embedResult = await embed({
    model: openai.embedding(EMBED_MODEL),
    value: query,
  })

  tracer?.log({
    event: "llm_call",
    stage: "how_to_rag_embed",
    model: EMBED_MODEL,
    prompt: { user: query },
    usage: {
      input_tokens: embedResult.usage?.tokens,
      total_tokens: embedResult.usage?.tokens,
    },
  })

  const scored = corpus
    .map((c) => ({ chunk: c, score: cosine(embedResult.embedding, c.embedding) }))
    .sort((a, b) => b.score - a.score)

  const candidates = scored.slice(0, CANDIDATE_K)
  const top = candidates.slice(0, TOP_K)

  const sources = top.map((s) => ({
    title: titleFor(s.chunk),
    chunk: s.chunk.text,
    score: Number(s.score.toFixed(4)),
  }))

  tracer?.log({
    event: "retrieval",
    stage: "how_to_rag",
    data: {
      query,
      candidate_count: candidates.length,
      top_k: TOP_K,
      candidates: candidates.map((s) => ({
        title: titleFor(s.chunk),
        score: Number(s.score.toFixed(4)),
      })),
    },
  })

  return {
    answer: sources.map((s) => `[${s.title}]\n${s.chunk}`).join("\n\n"),
    sources,
    needs_clarification: !!context && context.length > 0,
  }
}
