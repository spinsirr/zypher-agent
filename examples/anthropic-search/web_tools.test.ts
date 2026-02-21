/**
 * Basic tests for web_tools.ts - webSearch and webFetch functions
 *
 * Requires ANTHROPIC_API_KEY environment variable for integration tests.
 *
 * Run:
 *   deno test -A examples/anthropic-search/web_tools.test.ts
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { extractText, webFetch, webSearch } from "./web_tools.ts";

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
  const response = {
    content: [
      { type: "tool_use" },
    ],
  };
  assertEquals(extractText(response), "No content returned.");
});

Deno.test("extractText - handles empty content array", () => {
  const response = { content: [] };
  assertEquals(extractText(response), "No content returned.");
});

// ---------------------------------------------------------------------------
// Integration tests (require ANTHROPIC_API_KEY)
// ---------------------------------------------------------------------------

const hasApiKey = !!Deno.env.get("ANTHROPIC_API_KEY");

Deno.test({
  name: "webSearch - searches the web and returns results",
  ignore: !hasApiKey,
  fn: async () => {
    const result = await webSearch("Deno runtime 2024");
    console.log(
      "webSearch result (first 500 chars):",
      result.text.slice(0, 500),
    );
    assertEquals(typeof result.text, "string");
    assertEquals(result.text.length > 0, true);
    assertEquals(result.response.usage.input_tokens > 0, true);
  },
});

Deno.test({
  name: "webFetch - fetches content from a URL",
  ignore: !hasApiKey,
  fn: async () => {
    const result = await webFetch("https://example.com");
    console.log(
      "webFetch result (first 500 chars):",
      result.text.slice(0, 500),
    );
    assertEquals(typeof result.text, "string");
    assertStringIncludes(result.text.toLowerCase(), "example");
    assertEquals(result.response.usage.input_tokens > 0, true);
  },
});
