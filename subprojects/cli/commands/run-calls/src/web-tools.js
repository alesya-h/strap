import { toolResult, truncateText } from "./result.js";

async function webFetch(args) {
  const url = String(args.url ?? "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(args.timeout_ms || 120000));
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "user-agent": "strap/0.1" } });
    const limited = truncateText(await response.text(), Number(args.max_output_bytes || 60000));
    return toolResult(limited.text, { url, status: response.status, contentType: response.headers.get("content-type") || "", format: args.format || "text", truncated: limited.truncated });
  } finally {
    clearTimeout(timer);
  }
}

async function webSearch(args) {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(String(args.query ?? ""))}`;
  const response = await fetch(url, { headers: { "user-agent": "strap/0.1" } });
  const html = await response.text();
  const snippets = [...html.matchAll(/<a rel="nofollow" class="result__a" href="([^"]+)">([\s\S]*?)<\/a>/g)]
    .slice(0, Number(args.limit || 10))
    .map((match) => ({ url: decodeHtml(match[1]), title: stripTags(decodeHtml(match[2])) }));
  return toolResult(snippets.length ? snippets : `Search page fetched, but no results parsed. URL: ${url}`);
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function decodeHtml(value) {
  return value.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
}

export function webTools() {
  return [{ name: "web_fetch", execute: webFetch }, { name: "web_search", execute: webSearch }];
}
