/**
 * Cost Calculator for Anthropic API usage
 *
 * Pricing based on: https://docs.anthropic.com/en/docs/about-claude/pricing
 *
 * Additional costs:
 * - Web search: $10 per 1,000 searches (i.e. $0.01 per search)
 */

import type Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Pricing per million tokens (USD)
// ---------------------------------------------------------------------------

export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheWritePerMTok: number;
  cacheReadPerMTok: number;
}

const PRICING: Record<string, ModelPricing> = {
  // Opus 4.6
  "claude-opus-4-6": {
    inputPerMTok: 5,
    outputPerMTok: 25,
    cacheWritePerMTok: 6.25,
    cacheReadPerMTok: 0.50,
  },
  // Opus 4.5
  "claude-opus-4-5-20251101": {
    inputPerMTok: 5,
    outputPerMTok: 25,
    cacheWritePerMTok: 6.25,
    cacheReadPerMTok: 0.50,
  },
  // Opus 4.1
  "claude-opus-4-1-20250805": {
    inputPerMTok: 15,
    outputPerMTok: 75,
    cacheWritePerMTok: 18.75,
    cacheReadPerMTok: 1.50,
  },
  // Opus 4
  "claude-opus-4-20250514": {
    inputPerMTok: 15,
    outputPerMTok: 75,
    cacheWritePerMTok: 18.75,
    cacheReadPerMTok: 1.50,
  },
  // Sonnet 4.6
  "claude-sonnet-4-6": {
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheWritePerMTok: 3.75,
    cacheReadPerMTok: 0.30,
  },
  // Sonnet 4.5
  "claude-sonnet-4-5-20250929": {
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheWritePerMTok: 3.75,
    cacheReadPerMTok: 0.30,
  },
  // Sonnet 4
  "claude-sonnet-4-20250514": {
    inputPerMTok: 3,
    outputPerMTok: 15,
    cacheWritePerMTok: 3.75,
    cacheReadPerMTok: 0.30,
  },
  // Haiku 4.5
  "claude-haiku-4-5-20251001": {
    inputPerMTok: 1,
    outputPerMTok: 5,
    cacheWritePerMTok: 1.25,
    cacheReadPerMTok: 0.10,
  },
  // Haiku 3.5
  "claude-3-5-haiku-latest": {
    inputPerMTok: 0.80,
    outputPerMTok: 4,
    cacheWritePerMTok: 1,
    cacheReadPerMTok: 0.08,
  },
  // Haiku 3
  "claude-3-haiku-20240307": {
    inputPerMTok: 0.25,
    outputPerMTok: 1.25,
    cacheWritePerMTok: 0.30,
    cacheReadPerMTok: 0.03,
  },
};

/** Cost per web search request in USD */
const WEB_SEARCH_COST_PER_REQUEST = 0.01; // $10 per 1,000 searches

// ---------------------------------------------------------------------------
// Cost breakdown
// ---------------------------------------------------------------------------

export interface CostBreakdown {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  webSearchRequests: number;
  webFetchRequests: number;

  inputCost: number;
  outputCost: number;
  cacheWriteCost: number;
  cacheReadCost: number;
  webSearchCost: number;
  totalCost: number;
}

/**
 * Calculate cost from an Anthropic API response.
 *
 * @param model - Model ID used for the request
 * @param usage - Usage object from the Anthropic response
 * @returns Detailed cost breakdown in USD
 */
export function calculateCost(
  model: string,
  usage: Anthropic.Messages.Usage,
): CostBreakdown {
  const pricing = findPricing(model);

  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
  const webSearchRequests = usage.server_tool_use?.web_search_requests ?? 0;
  const webFetchRequests = usage.server_tool_use?.web_fetch_requests ?? 0;

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMTok;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMTok;
  const cacheWriteCost = (cacheCreationTokens / 1_000_000) *
    pricing.cacheWritePerMTok;
  const cacheReadCost = (cacheReadTokens / 1_000_000) *
    pricing.cacheReadPerMTok;
  const webSearchCost = webSearchRequests * WEB_SEARCH_COST_PER_REQUEST;

  return {
    model,
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    webSearchRequests,
    webFetchRequests,
    inputCost,
    outputCost,
    cacheWriteCost,
    cacheReadCost,
    webSearchCost,
    totalCost: inputCost + outputCost + cacheWriteCost + cacheReadCost +
      webSearchCost,
  };
}

/**
 * Format a CostBreakdown into a human-readable string.
 */
export function formatCost(cost: CostBreakdown): string {
  const lines = [
    `Model: ${cost.model}`,
    `Tokens: ${cost.inputTokens} in / ${cost.outputTokens} out`,
  ];

  if (cost.cacheCreationTokens > 0) {
    lines.push(`Cache write: ${cost.cacheCreationTokens} tokens`);
  }
  if (cost.cacheReadTokens > 0) {
    lines.push(`Cache read: ${cost.cacheReadTokens} tokens`);
  }
  if (cost.webSearchRequests > 0) {
    lines.push(`Web searches: ${cost.webSearchRequests}`);
  }
  if (cost.webFetchRequests > 0) {
    lines.push(`Web fetches: ${cost.webFetchRequests}`);
  }

  lines.push(``);
  lines.push(`Cost breakdown:`);
  lines.push(`  Input:        $${cost.inputCost.toFixed(6)}`);
  lines.push(`  Output:       $${cost.outputCost.toFixed(6)}`);

  if (cost.cacheWriteCost > 0) {
    lines.push(`  Cache write:  $${cost.cacheWriteCost.toFixed(6)}`);
  }
  if (cost.cacheReadCost > 0) {
    lines.push(`  Cache read:   $${cost.cacheReadCost.toFixed(6)}`);
  }
  if (cost.webSearchCost > 0) {
    lines.push(`  Web search:   $${cost.webSearchCost.toFixed(6)}`);
  }

  lines.push(`  ─────────────────────`);
  lines.push(`  Total:        $${cost.totalCost.toFixed(6)}`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findPricing(model: string): ModelPricing {
  // Exact match first
  if (PRICING[model]) return PRICING[model];

  // Fuzzy match by prefix
  for (const [key, pricing] of Object.entries(PRICING)) {
    if (model.startsWith(key) || key.startsWith(model)) {
      return pricing;
    }
  }

  // Fallback: try to match by model family
  if (model.includes("opus-4-6") || model.includes("opus-4.6")) {
    return PRICING["claude-opus-4-6"];
  }
  if (model.includes("opus-4-5") || model.includes("opus-4.5")) {
    return PRICING["claude-opus-4-5-20251101"];
  }
  if (model.includes("opus-4-1") || model.includes("opus-4.1")) {
    return PRICING["claude-opus-4-1-20250805"];
  }
  if (model.includes("opus-4") || model.includes("opus4")) {
    return PRICING["claude-opus-4-20250514"];
  }
  if (model.includes("sonnet-4-6") || model.includes("sonnet-4.6")) {
    return PRICING["claude-sonnet-4-6"];
  }
  if (model.includes("sonnet-4-5") || model.includes("sonnet-4.5")) {
    return PRICING["claude-sonnet-4-5-20250929"];
  }
  if (model.includes("sonnet-4") || model.includes("sonnet4")) {
    return PRICING["claude-sonnet-4-20250514"];
  }
  if (model.includes("haiku-4-5") || model.includes("haiku-4.5")) {
    return PRICING["claude-haiku-4-5-20251001"];
  }
  if (model.includes("haiku-3-5") || model.includes("haiku-3.5")) {
    return PRICING["claude-3-5-haiku-latest"];
  }
  if (model.includes("haiku")) {
    return PRICING["claude-3-haiku-20240307"];
  }

  throw new Error(
    `Unknown model: "${model}". Add pricing to PRICING table.`,
  );
}
