/**
 * Simple cost & performance test for Anthropic web tools.
 *
 * Uses a simplified pricing table — only major model families.
 *
 * Run:
 *   deno test -A examples/anthropic-search/cost.test.ts
 */

import { assertEquals } from "@std/assert";
import { webFetch, webSearch } from "./web_tools.ts";

// ---------------------------------------------------------------------------
// Simplified pricing (USD per million tokens)
// ---------------------------------------------------------------------------

interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

const PRICING: Record<string, ModelPricing> = {
  opus: { inputPerMTok: 15, outputPerMTok: 75 },
  sonnet: { inputPerMTok: 3, outputPerMTok: 15 },
  haiku: { inputPerMTok: 1, outputPerMTok: 5 },
};

const WEB_SEARCH_COST = 0.01; // $0.01 per search request

function findPricing(model: string): ModelPricing {
  for (const family of ["opus", "sonnet", "haiku"]) {
    if (model.includes(family)) return PRICING[family];
  }
  return PRICING["sonnet"]; // default fallback
}

interface CostResult {
  inputCost: number;
  outputCost: number;
  webSearchCost: number;
  totalCost: number;
}

function calculateCost(
  model: string,
  usage: {
    input_tokens: number;
    output_tokens: number;
    server_tool_use?: { web_search_requests?: number };
  },
): CostResult {
  const pricing = findPricing(model);
  const inputCost = (usage.input_tokens / 1_000_000) * pricing.inputPerMTok;
  const outputCost = (usage.output_tokens / 1_000_000) * pricing.outputPerMTok;
  const webSearchCost = (usage.server_tool_use?.web_search_requests ?? 0) *
    WEB_SEARCH_COST;
  return {
    inputCost,
    outputCost,
    webSearchCost,
    totalCost: inputCost + outputCost + webSearchCost,
  };
}

// ---------------------------------------------------------------------------
// Unit test
// ---------------------------------------------------------------------------

Deno.test("calculateCost - basic cost calculation", () => {
  const cost = calculateCost("claude-sonnet-4-5-20250929", {
    input_tokens: 1000,
    output_tokens: 500,
    server_tool_use: { web_search_requests: 1 },
  });

  // Sonnet: $3/MTok input, $15/MTok output, $0.01 per search
  assertEquals(cost.inputCost, (1000 / 1_000_000) * 3);
  assertEquals(cost.outputCost, (500 / 1_000_000) * 15);
  assertEquals(cost.webSearchCost, 0.01);
  assertEquals(
    cost.totalCost,
    cost.inputCost + cost.outputCost + cost.webSearchCost,
  );
});

// ---------------------------------------------------------------------------
// Integration tests (require ANTHROPIC_API_KEY)
// ---------------------------------------------------------------------------

const hasApiKey = !!Deno.env.get("ANTHROPIC_API_KEY");

Deno.test({
  name: "webSearch - performance & cost",
  ignore: !hasApiKey,
  fn: async () => {
    const start = performance.now();
    const result = await webSearch("Deno runtime 2025");
    const elapsed = performance.now() - start;
    const cost = calculateCost(result.response.model, result.response.usage);

    console.log(`\n── webSearch ──`);
    console.log(`  Latency: ${elapsed.toFixed(0)}ms`);
    console.log(
      `  Tokens:  ${result.response.usage.input_tokens} in / ${result.response.usage.output_tokens} out`,
    );
    console.log(`  Cost:    $${cost.totalCost.toFixed(6)}`);

    assertEquals(result.text.length > 0, true);
  },
});

Deno.test({
  name: "webFetch - performance & cost",
  ignore: !hasApiKey,
  fn: async () => {
    const start = performance.now();
    const result = await webFetch("https://example.com");
    const elapsed = performance.now() - start;
    const cost = calculateCost(result.response.model, result.response.usage);

    console.log(`\n── webFetch ──`);
    console.log(`  Latency: ${elapsed.toFixed(0)}ms`);
    console.log(
      `  Tokens:  ${result.response.usage.input_tokens} in / ${result.response.usage.output_tokens} out`,
    );
    console.log(`  Cost:    $${cost.totalCost.toFixed(6)}`);

    assertEquals(result.text.length > 0, true);
  },
});
