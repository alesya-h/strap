import { toolResult, truncateText } from "#strap/core/result";
import { integerSchema, objectSchema, optionalInteger, optionalString, requireString, stringSchema } from "#strap/core/schemas";

async function webFetch(args) {
  const url = requireString(args, "url");
  const format = optionalString(args, "format", "text");
  const timeoutMs = optionalInteger(args, "timeout_ms", 120000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "user-agent": "strap/0.1" } });
    const text = await response.text();
    const limited = truncateText(text, optionalInteger(args, "max_output_bytes", 60000));
    return toolResult(limited.text, {
      url,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      format,
      truncated: limited.truncated,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function searchWeb(args) {
  const query = requireString(args, "query");
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { "user-agent": "strap/0.1" } });
  const html = await response.text();
  const snippets = [...html.matchAll(/<a rel="nofollow" class="result__a" href="([^"]+)">([\s\S]*?)<\/a>/g)]
    .slice(0, optionalInteger(args, "limit", 10))
    .map((match) => ({ url: decodeHtml(match[1]), title: stripTags(decodeHtml(match[2])) }));
  return toolResult(snippets.length ? snippets : `Search page fetched, but no results parsed. URL: ${url}`);
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

export function webTools() {
  return [
    {
      name: "web_fetch",
      description: "Fetch a URL and return text with response metadata. Conversion is intentionally minimal; downstream tools can transform it.",
      inputSchema: objectSchema({
        url: stringSchema("Fully-qualified URL"),
        format: stringSchema("Requested output format hint: text, html, or markdown"),
        timeout_ms: integerSchema("Timeout in milliseconds", { minimum: 1 }),
        max_output_bytes: integerSchema("Maximum bytes returned to the model", { minimum: 1 }),
      }, ["url"]),
      readOnly: true,
      openWorld: true,
      execute: webFetch,
    },
    {
      name: "web_search",
      description: "Search the web using a lightweight public HTML search page and return parsed result titles/URLs when available.",
      inputSchema: objectSchema({
        query: stringSchema("Search query"),
        limit: integerSchema("Maximum parsed results", { minimum: 1 }),
      }, ["query"]),
      readOnly: true,
      openWorld: true,
      execute: searchWeb,
    },
  ];
}
