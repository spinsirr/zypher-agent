/**
 * Performance & Cost tests for web_tools
 *
 * Tests web_search and web_fetch with timing and cost tracking.
 *
 * Requires ANTHROPIC_API_KEY environment variable.
 *
 * Run:
 *   deno test -A examples/anthropic-search/web_tools_performance.test.ts
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  extractText,
  webFetch,
  webSearch,
} from "./web_tools.ts";
import { calculateCost, formatCost } from "./cost.ts";

// ---------------------------------------------------------------------------
// Unit tests (no API calls)
// ---------------------------------------------------------------------------

Deno.test("extractText - extracts text blocks from response", () => {
  const response = {
    content: [
      { type: "text", text: "Hello" },
      { type: "tool_use", text: undefined },
      { type: "text", text: "World" },
    ],
  };
  assertEquals(extractText(response), "Hello\nWorld");
});

Deno.test("extractText - returns fallback when no text blocks", () => {
  const response = { content: [{ type: "tool_use" }] };
  assertEquals(extractText(response), "No content returned.");
});

Deno.test("extractText - handles empty content array", () => {
  const response = { content: [] };
  assertEquals(extractText(response), "No content returned.");
});

Deno.test("calculateCost - haiku 4.5 basic usage", () => {
  const cost = calculateCost("claude-haiku-4-5-20251001", {
    input_tokens: 1000,
    output_tokens: 500,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 },
    cache_creation: null,
    inference_geo: null,
    service_tier: null,
  });

  // Haiku 4.5: $1/MTok input, $5/MTok output, $0.01 per search
  assertEquals(cost.inputCost, 1000 / 1_000_000 * 1); // $0.001
  assertEquals(cost.outputCost, 500 / 1_000_000 * 5); // $0.0025
  assertEquals(cost.webSearchCost, 0.01);
  assertEquals(cost.totalCost, 0.001 + 0.0025 + 0.01);
});

Deno.test("calculateCost - sonnet 4.5 with cache", () => {
  const cost = calculateCost("claude-sonnet-4-5-20250929", {
    input_tokens: 5000,
    output_tokens: 2000,
    cache_creation_input_tokens: 1000,
    cache_read_input_tokens: 3000,
    server_tool_use: { web_search_requests: 3, web_fetch_requests: 2 },
    cache_creation: null,
    inference_geo: null,
    service_tier: null,
  });

  // Sonnet 4.5: $3/MTok input, $15/MTok output
  assertEquals(cost.model, "claude-sonnet-4-5-20250929");
  assertEquals(cost.webSearchRequests, 3);
  assertEquals(cost.webFetchRequests, 2);
  assertEquals(cost.webSearchCost, 0.03); // 3 * $0.01
  assertEquals(cost.totalCost > 0, true);
});

Deno.test("formatCost - produces readable output", () => {
  const cost = calculateCost("claude-haiku-4-5-20251001", {
    input_tokens: 10000,
    output_tokens: 5000,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    server_tool_use: { web_search_requests: 2, web_fetch_requests: 1 },
    cache_creation: null,
    inference_geo: null,
    service_tier: null,
  });

  const output = formatCost(cost);
  assertStringIncludes(output, "Model: claude-haiku-4-5-20251001");
  assertStringIncludes(output, "10000 in / 5000 out");
  assertStringIncludes(output, "Web searches: 2");
  assertStringIncludes(output, "Web fetches: 1");
  assertStringIncludes(output, "Total:");
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

    const model = result.response.model;
    const cost = calculateCost(model, result.response.usage);

    console.log("\n┌─── webSearch Performance ───────────────────");
    console.log(`│ Query:     "Deno runtime 2025"`);
    console.log(`│ Latency:   ${elapsed.toFixed(0)}ms`);
    console.log(`│ Result:    ${result.text.length} chars`);
    console.log(`│ Stop:      ${result.response.stop_reason}`);
    console.log("│");
    console.log(`│ ${formatCost(cost).replace(/\n/g, "\n│ ")}`);
    console.log("└─────────────────────────────────────────────\n");

    assertEquals(typeof result.text, "string");
    assertEquals(result.text.length > 0, true);
    assertEquals(result.response.usage.input_tokens > 0, true);
    assertEquals(result.response.usage.output_tokens > 0, true);
  },
});

Deno.test({
  name: "webFetch - performance & cost",
  ignore: !hasApiKey,
  fn: async () => {
    const url = "https://example.com";
    const start = performance.now();
    const result = await webFetch(url);
    const elapsed = performance.now() - start;

    const model = result.response.model;
    const cost = calculateCost(model, result.response.usage);

    console.log("\n┌─── webFetch Performance ────────────────────");
    console.log(`│ URL:       ${url}`);
    console.log(`│ Latency:   ${elapsed.toFixed(0)}ms`);
    console.log(`│ Result:    ${result.text.length} chars`);
    console.log(`│ Stop:      ${result.response.stop_reason}`);
    console.log("│");
    console.log(`│ ${formatCost(cost).replace(/\n/g, "\n│ ")}`);
    console.log("└─────────────────────────────────────────────\n");

    assertEquals(typeof result.text, "string");
    assertStringIncludes(result.text.toLowerCase(), "example");
    assertEquals(result.response.usage.input_tokens > 0, true);
  },
});

Deno.test({
  name: "webSearch + webFetch combined - total cost",
  ignore: !hasApiKey,
  fn: async () => {
    const totalStart = performance.now();

    // Step 1: Search
    const searchStart = performance.now();
    const searchResult = await webSearch("Anthropic Claude API pricing 2025");
    const searchElapsed = performance.now() - searchStart;

    // Step 2: Fetch a known page
    const fetchStart = performance.now();
    const fetchResult = await webFetch(
      "https://docs.anthropic.com/en/docs/about-claude/pricing",
    );
    const fetchElapsed = performance.now() - fetchStart;

    const totalElapsed = performance.now() - totalStart;

    const searchCost = calculateCost(searchResult.response.model, searchResult.response.usage);
    const fetchCost = calculateCost(fetchResult.response.model, fetchResult.response.usage);
    const combinedCost = searchCost.totalCost + fetchCost.totalCost;

    console.log("\n╔═══ Combined Performance & Cost ═════════════");
    console.log("║");
    console.log("║ ── Search ──");
    console.log(`║   Latency:  ${searchElapsed.toFixed(0)}ms`);
    console.log(
      `║   Tokens:   ${searchResult.response.usage.input_tokens} in / ${searchResult.response.usage.output_tokens} out`,
    );
    console.log(`║   Cost:     $${searchCost.totalCost.toFixed(6)}`);
    console.log("║");
    console.log("║ ── Fetch ──");
    console.log(`║   Latency:  ${fetchElapsed.toFixed(0)}ms`);
    console.log(
      `║   Tokens:   ${fetchResult.response.usage.input_tokens} in / ${fetchResult.response.usage.output_tokens} out`,
    );
    console.log(`║   Cost:     $${fetchCost.totalCost.toFixed(6)}`);
    console.log("║");
    console.log("║ ── Totals ──");
    console.log(`║   Latency:  ${totalElapsed.toFixed(0)}ms`);
    console.log(`║   Cost:     $${combinedCost.toFixed(6)}`);
    console.log(
      "╚═════════════════════════════════════════════\n",
    );

    assertEquals(searchResult.text.length > 0, true);
    assertEquals(fetchResult.text.length > 0, true);
  },
});
