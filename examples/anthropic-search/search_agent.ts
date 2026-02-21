/**
 * Example: Web Search Agent
 *
 * Demonstrates a Zypher Agent with two tools that encapsulate Anthropic's
 * server-side web_search and web_fetch capabilities as regular tools.
 *
 * - web_search: Search the web for real-time information
 * - web_fetch:  Fetch full content from a web page or PDF
 *
 * See:
 * - https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool
 * - https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-fetch-tool
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY - Anthropic API key (required)
 *   ZYPHER_MODEL      - Model to use (default: claude-sonnet-4-5-20250929)
 *   PORT              - Port to listen on (default: 8080)
 *
 * Run:
 *   deno run --env -A examples/anthropic-search/search_agent.ts
 *
 * Test with WebSocket client:
 *   wscat -c ws://localhost:8080/task/ws -s zypher.v1
 *   > {"action":"startTask","task":"What are the latest AI breakthroughs?"}
 *   > {"action":"startTask","task":"Fetch and summarize https://example.com"}
 */

import { createZypherAgent } from "@zypher/agent";
import { createTool } from "@zypher/agent/tools";
import { createZypherHandler } from "@zypher/http";
import { parsePort } from "@zypher/utils/env";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { webFetch as webFetchFn, webSearch as webSearchFn } from "./web_tools.ts";

const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const webSearch = createTool({
  name: "web_search",
  description:
    "Search the web for real-time information. Returns results with sources.",
  schema: z.object({
    query: z.string().describe("The search query"),
  }),
  execute: async ({ query }) => {
    const result = await webSearchFn(query);
    return result.text;
  },
});

const webFetch = createTool({
  name: "web_fetch",
  description:
    "Fetch full content from a web page or PDF document at a given URL.",
  schema: z.object({
    url: z.string().describe("The URL to fetch"),
  }),
  execute: async ({ url }) => {
    const result = await webFetchFn(url);
    return result.text;
  },
});

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const port = parsePort(Deno.env.get("PORT"), 8080);

const agent = await createZypherAgent({
  model: Deno.env.get("ZYPHER_MODEL") ?? DEFAULT_MODEL,
  tools: [webSearch, webFetch],
});

const app = new Hono()
  .use(cors())
  .route("/", createZypherHandler({ agent }));

Deno.serve({ port }, app.fetch);

console.log(`Search Agent listening on http://localhost:${port}`);
console.log(`WebSocket endpoint: ws://localhost:${port}/task/ws`);
console.log(
  `\nTest with: wscat -c ws://localhost:${port}/task/ws -s zypher.v1`,
);
console.log(`\nExample tasks:`);
console.log(
  `  {"action":"startTask","task":"What are the latest AI breakthroughs?"}`,
);
console.log(
  `  {"action":"startTask","task":"Fetch and summarize https://example.com"}`,
);
