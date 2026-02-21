/**
 * Benchmark & cost tests for Anthropic web tools.
 *
 * Runs 10 web searches concurrently, then 10 web fetches concurrently,
 * and reports latency & cost for each phase.
 *
 * Run benchmark:
 *   deno run --env -A examples/anthropic-search/benchmark.ts
 *
 * Run tests:
 *   deno test -A examples/anthropic-search/benchmark.ts
 */

import { assertEquals } from "@std/assert";
import { webFetch, webSearch } from "./web_tools.ts";

// ---------------------------------------------------------------------------
// Pricing (USD per million tokens)
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
    server_tool_use?: { web_search_requests?: number } | null;
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
// Benchmark data
// ---------------------------------------------------------------------------

const SEARCH_QUERIES = [
  "Latest AI breakthroughs 2026",
  "Deno 2.0 new features",
  "TypeScript 6.0 release date",
  "SpaceX Starship latest launch",
  "Claude AI capabilities 2026",
  "Rust vs Go performance comparison",
  "Best open source LLM models 2026",
  "WebAssembly adoption trends",
  "Anthropic company valuation",
  "MCP Model Context Protocol specification",
];

const FETCH_URLS = [
  "https://example.com",
  "https://deno.land",
  "https://www.rust-lang.org",
  "https://go.dev",
  "https://www.typescriptlang.org",
  "https://webassembly.org",
  "https://nodejs.org",
  "https://reactjs.org",
  "https://svelte.dev",
  "https://docs.anthropic.com",
];

// ---------------------------------------------------------------------------
// Shared types & helpers
// ---------------------------------------------------------------------------

interface TaskResult {
  label: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  resultChars: number;
  cost: CostResult;
  success: boolean;
  error?: string;
}

function printPhaseReport(phase: string, results: TaskResult[]) {
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  const totalLatency = successful.reduce((s, r) => s + r.latencyMs, 0);
  const totalInput = successful.reduce((s, r) => s + r.inputTokens, 0);
  const totalOutput = successful.reduce((s, r) => s + r.outputTokens, 0);
  const totalCost = successful.reduce((s, r) => s + r.cost.totalCost, 0);
  const totalChars = successful.reduce((s, r) => s + r.resultChars, 0);

  const avgLatency = successful.length > 0
    ? totalLatency / successful.length
    : 0;
  const minLatency = successful.length > 0
    ? Math.min(...successful.map((r) => r.latencyMs))
    : 0;
  const maxLatency = successful.length > 0
    ? Math.max(...successful.map((r) => r.latencyMs))
    : 0;

  console.log(`\n  Total:          ${results.length}`);
  console.log(`  Successful:     ${successful.length}`);
  console.log(`  Failed:         ${failed.length}\n`);

  console.log(`── ${phase} Latency ─────────────────────────────────────────`);
  console.log(`  Total:          ${(totalLatency / 1000).toFixed(2)}s`);
  console.log(`  Average:        ${avgLatency.toFixed(0)}ms`);
  console.log(`  Min:            ${minLatency.toFixed(0)}ms`);
  console.log(`  Max:            ${maxLatency.toFixed(0)}ms\n`);

  console.log(`── ${phase} Tokens ──────────────────────────────────────────`);
  console.log(`  Total input:    ${totalInput.toLocaleString()}`);
  console.log(`  Total output:   ${totalOutput.toLocaleString()}`);
  console.log(
    `  Avg input:      ${
      successful.length > 0
        ? Math.round(totalInput / successful.length).toLocaleString()
        : 0
    }`,
  );
  console.log(
    `  Avg output:     ${
      successful.length > 0
        ? Math.round(totalOutput / successful.length).toLocaleString()
        : 0
    }\n`,
  );

  console.log(`── ${phase} Cost ────────────────────────────────────────────`);
  console.log(`  Total cost:     $${totalCost.toFixed(6)}`);
  console.log(
    `  Avg per call:   $${
      (successful.length > 0 ? totalCost / successful.length : 0).toFixed(6)
    }\n`,
  );

  console.log(`── ${phase} Output ──────────────────────────────────────────`);
  console.log(`  Total chars:    ${totalChars.toLocaleString()}`);
  console.log(
    `  Avg chars:      ${
      successful.length > 0
        ? Math.round(totalChars / successful.length).toLocaleString()
        : 0
    }\n`,
  );

  if (failed.length > 0) {
    console.log(
      `── ${phase} Failures ────────────────────────────────────────`,
    );
    for (const r of failed) {
      console.log(`  "${r.label}": ${r.error}`);
    }
    console.log();
  }

  // Per-item table
  console.log(`── ${phase} Per-Item Details ────────────────────────────────\n`);
  console.log(
    "#".padStart(3) + "  " +
      "Latency".padStart(8) + "  " +
      "In Tok".padStart(8) + "  " +
      "Out Tok".padStart(8) + "  " +
      "Cost".padStart(10) + "  " +
      "Label",
  );
  console.log("─".repeat(80));

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.success) {
      console.log(
        String(i + 1).padStart(3) + "  " +
          `${r.latencyMs.toFixed(0)}ms`.padStart(8) + "  " +
          r.inputTokens.toLocaleString().padStart(8) + "  " +
          r.outputTokens.toLocaleString().padStart(8) + "  " +
          `$${r.cost.totalCost.toFixed(6)}`.padStart(10) + "  " +
          r.label,
      );
    } else {
      console.log(
        String(i + 1).padStart(3) + "  " +
          "FAILED".padStart(8) + "  " +
          "-".padStart(8) + "  " +
          "-".padStart(8) + "  " +
          "-".padStart(10) + "  " +
          r.label,
      );
    }
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Benchmark runner
// ---------------------------------------------------------------------------

async function runBenchmark() {
  console.log(
    "╔══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║     Web Tools Benchmark — 10 Searches + 10 Fetches         ║",
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════╝\n",
  );

  // ── Phase 1: 10 concurrent web searches ──
  console.log(
    "══════════════════════════════════════════════════════════════",
  );
  console.log(
    "  PHASE 1: Web Search (10 concurrent requests)",
  );
  console.log(
    "══════════════════════════════════════════════════════════════",
  );

  const searchWallStart = performance.now();
  const searchPromises = SEARCH_QUERIES.map(async (query): Promise<TaskResult> => {
    const start = performance.now();
    try {
      const result = await webSearch(query);
      const elapsed = performance.now() - start;
      const cost = calculateCost(result.response.model, result.response.usage);
      return {
        label: query,
        latencyMs: elapsed,
        inputTokens: result.response.usage.input_tokens,
        outputTokens: result.response.usage.output_tokens,
        resultChars: result.text.length,
        cost,
        success: true,
      };
    } catch (err) {
      const elapsed = performance.now() - start;
      return {
        label: query,
        latencyMs: elapsed,
        inputTokens: 0,
        outputTokens: 0,
        resultChars: 0,
        cost: { inputCost: 0, outputCost: 0, webSearchCost: 0, totalCost: 0 },
        success: false,
        error: String(err),
      };
    }
  });
  const searchResults = await Promise.all(searchPromises);
  const searchWallTime = performance.now() - searchWallStart;

  console.log(`\n  Wall-clock time: ${(searchWallTime / 1000).toFixed(2)}s`);
  printPhaseReport("Search", searchResults);

  // ── Phase 2: 10 concurrent web fetches ──
  console.log(
    "══════════════════════════════════════════════════════════════",
  );
  console.log(
    "  PHASE 2: Web Fetch (10 concurrent requests)",
  );
  console.log(
    "══════════════════════════════════════════════════════════════",
  );

  const fetchWallStart = performance.now();
  const fetchPromises = FETCH_URLS.map(async (url): Promise<TaskResult> => {
    const start = performance.now();
    try {
      const result = await webFetch(url);
      const elapsed = performance.now() - start;
      const cost = calculateCost(result.response.model, result.response.usage);
      return {
        label: url,
        latencyMs: elapsed,
        inputTokens: result.response.usage.input_tokens,
        outputTokens: result.response.usage.output_tokens,
        resultChars: result.text.length,
        cost,
        success: true,
      };
    } catch (err) {
      const elapsed = performance.now() - start;
      return {
        label: url,
        latencyMs: elapsed,
        inputTokens: 0,
        outputTokens: 0,
        resultChars: 0,
        cost: { inputCost: 0, outputCost: 0, webSearchCost: 0, totalCost: 0 },
        success: false,
        error: String(err),
      };
    }
  });
  const fetchResults = await Promise.all(fetchPromises);
  const fetchWallTime = performance.now() - fetchWallStart;

  console.log(`\n  Wall-clock time: ${(fetchWallTime / 1000).toFixed(2)}s`);
  printPhaseReport("Fetch", fetchResults);

  // ── Combined summary ──
  const allResults = [...searchResults, ...fetchResults];
  const allSuccessful = allResults.filter((r) => r.success);
  const totalCost = allSuccessful.reduce(
    (s, r) => s + r.cost.totalCost,
    0,
  );

  console.log(
    "══════════════════════════════════════════════════════════════",
  );
  console.log(
    "                     COMBINED SUMMARY",
  );
  console.log(
    "══════════════════════════════════════════════════════════════\n",
  );

  console.log(`  Search wall-clock:  ${(searchWallTime / 1000).toFixed(2)}s`);
  console.log(`  Fetch wall-clock:   ${(fetchWallTime / 1000).toFixed(2)}s`);
  console.log(
    `  Total wall-clock:   ${
      ((searchWallTime + fetchWallTime) / 1000).toFixed(2)
    }s\n`,
  );
  console.log(
    `  Total requests:     ${allResults.length} (${allSuccessful.length} ok, ${
      allResults.length - allSuccessful.length
    } failed)`,
  );
  console.log(
    `  Total input tokens: ${
      allSuccessful.reduce((s, r) => s + r.inputTokens, 0).toLocaleString()
    }`,
  );
  console.log(
    `  Total output tokens:${
      allSuccessful.reduce((s, r) => s + r.outputTokens, 0).toLocaleString()
    }`,
  );
  console.log(`  Total cost:         $${totalCost.toFixed(6)}\n`);

  console.log(
    "══════════════════════════════════════════════════════════════\n",
  );

}

// ---------------------------------------------------------------------------
// Tests
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

// ---------------------------------------------------------------------------
// CLI entry point — run benchmark when executed directly
// ---------------------------------------------------------------------------

if (import.meta.main) {
  await runBenchmark();
}
