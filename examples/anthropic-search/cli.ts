/**
 * CLI for web_search / web_fetch
 *
 * Usage:
 *   deno run --env -A examples/anthropic-search/cli.ts search "AI company"
 *   deno run --env -A examples/anthropic-search/cli.ts fetch  "https://example.com"
 */

import { webFetch, webSearch } from "./web_tools.ts";

const [command, ...rest] = Deno.args;
const query = rest.join(" ");

if (!command || !query) {
  console.error("Usage: cli.ts <search|fetch> <query|url>");
  Deno.exit(1);
}

if (command === "search") {
  console.log(`Searching: ${query}\n`);
  const result = await webSearch(query);
  console.log(result.text);
  console.log(
    `\n[Usage] input=${result.response.usage.input_tokens} output=${result.response.usage.output_tokens}`,
  );
} else if (command === "fetch") {
  console.log(`Fetching: ${query}\n`);
  const result = await webFetch(query);
  console.log(result.text);
  console.log(
    `\n[Usage] input=${result.response.usage.input_tokens} output=${result.response.usage.output_tokens}`,
  );
} else {
  console.error(`Unknown command: ${command}. Use "search" or "fetch".`);
  Deno.exit(1);
}
