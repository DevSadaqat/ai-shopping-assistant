import type { HowToResult } from "../types"

const STUB_CHUNKS = [
  {
    title: "Bathroom Tiling Guide",
    chunk: "Before tiling, apply waterproofing membrane to all wet areas. Use appropriate tile adhesive for the surface type. Place tile spacers for consistent grout lines. Allow adhesive to cure before grouting.",
    score: 0.91,
  },
  {
    title: "Bathroom Tiling Guide",
    chunk: "Start tiling from the centre of the floor and work outward to ensure symmetrical cuts at the edges. Use a notched trowel to apply adhesive in even ridges.",
    score: 0.87,
  },
  {
    title: "Bathroom Tiling Guide",
    chunk: "Mix grout to a peanut-butter consistency. Work it into joints diagonally with a rubber float. Clean excess with a damp sponge before it sets.",
    score: 0.83,
  },
]

export async function howToRag(
  query: string,
  context?: string
): Promise<HowToResult> {
  // Phase 4 replaces this with embed → retrieve → rerank → generate
  return {
    answer: `Here are the key steps based on our how-to guides:\n\n${STUB_CHUNKS.map((c) => c.chunk).join("\n\n")}`,
    sources: STUB_CHUNKS,
    needs_clarification: !!context && context.length > 0,
  }
}
