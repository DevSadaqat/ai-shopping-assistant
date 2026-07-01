import { openai } from "@ai-sdk/openai"
import { generateText, Output } from "ai"
import { z } from "zod"
import type { RouterResult } from "./types"

const RouterSchema = z.object({
  intent: z.enum([
    "PRODUCT_SEARCH",
    "HOW_TO",
    "STOCK_CHECK",
    "SAFETY_ESCALATE",
    "CLARIFY",
    "OFF_TOPIC",
  ]),
  confidence: z.enum(["high", "medium", "low"]),
})

const ROUTER_SYSTEM = `You are a shopping assistant intent classifier for a hardware/home-improvement store.
Classify the user's message into exactly one intent:

PRODUCT_SEARCH — user wants to find, compare, or get recommendations for products
  Triggers: "find me", "what's a good", "recommend", price/feature constraints, "I need a X"

HOW_TO — user wants instructions or advice on how to do a project or task
  Triggers: "how do I", "can I", "what's the best way to", project planning questions

STOCK_CHECK — user is asking about availability of a specific item
  Triggers: "is X in stock", "do you have", "available near me", "can I pick up"

SAFETY_ESCALATE — query involves licensed trade work (electrical mains, gas lines, structural, hazmat)
  Triggers: main panel, switchboard, new 240V circuit, rewiring, meter box, gas line/fitting/appliance install,
  load-bearing wall, foundation, beam removal, hot water system replacement, drain rerouting, asbestos, lead paint removal

CLARIFY — query is ambiguous and could fit multiple intents; a follow-up question is needed

OFF_TOPIC — query has nothing to do with shopping, products, home improvement, or hardware

Respond with JSON only.`

export async function classifyIntent(
  userMessage: string
): Promise<RouterResult> {
  const result = await generateText({
    model: openai("gpt-4o-mini"),
    system: ROUTER_SYSTEM,
    prompt: userMessage,
    output: Output.object({ schema: RouterSchema }),
  })

  return result.output as RouterResult
}
