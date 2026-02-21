/**
 * Web Tools - Standalone web_search and web_fetch functions
 *
 * Wraps Anthropic's server-side web_search and web_fetch capabilities
 * into simple async functions using the official Anthropic SDK.
 *
 * Both tools use the stable Messages API (`client.messages.create()`).
 *
 * See:
 * - https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool
 * - https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-fetch-tool
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY - Anthropic API key (required)
 */

import Anthropic from "@anthropic-ai/sdk";

export const TOOL_MODEL = "claude-haiku-4-5-20251001";

let _client: Anthropic | null = null;

/** Get or create the shared Anthropic client. */
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic();
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result from web tools, including the text content and raw API response. */
export interface WebToolResult {
  /** Extracted text content */
  text: string;
  /** Full Anthropic API response (for usage/cost tracking) */
  response: Anthropic.Messages.Message;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract all text blocks from an Anthropic message response. */
export function extractText(
  response: { content: { type: string; text?: string }[] },
): string {
  return response.content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text!)
    .join("\n") || "No content returned.";
}

// ---------------------------------------------------------------------------
// Web Search
// ---------------------------------------------------------------------------

/**
 * Search the web using Anthropic's server-side web_search tool.
 *
 * Uses the stable Messages API with `web_search_20260209`.
 *
 * @param query - The search query
 * @returns WebToolResult with text and full response (including usage)
 */
export async function webSearch(query: string): Promise<WebToolResult> {
  const client = getClient();

  const response = await client.messages.create({
    model: TOOL_MODEL,
    max_tokens: 4096,
    tools: [
      { type: "web_search_20260209", name: "web_search", max_uses: 1, allowed_callers: ["direct"] },
    ],
    messages: [
      {
        role: "user",
        content:
          `Search the web for: ${query}\n\nReturn the search results with sources.`,
      },
    ],
  });

  return { text: extractText(response), response };
}

// ---------------------------------------------------------------------------
// Web Fetch
// ---------------------------------------------------------------------------

/**
 * Fetch full content from a web page or PDF using Anthropic's server-side
 * web_fetch tool.
 *
 * Uses the stable Messages API with `web_fetch_20260209`.
 *
 * @param url - The URL to fetch
 * @returns WebToolResult with text and full response (including usage)
 */
export async function webFetch(url: string): Promise<WebToolResult> {
  const client = getClient();

  const response = await client.messages.create({
    model: TOOL_MODEL,
    max_tokens: 8192,
    tools: [
      { type: "web_fetch_20260209", name: "web_fetch", max_uses: 1, allowed_callers: ["direct"] },
    ],
    messages: [
      {
        role: "user",
        content: `Fetch and return the full content from this URL: ${url}`,
      },
    ],
  });

  return { text: extractText(response), response };
}
