import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

function endpoint() {
  return process.env.STRAP_JSMCP_URL || "http://127.0.0.1:41528";
}

function apiKey() {
  if (process.env.STRAP_JSMCP_API_KEY) return process.env.STRAP_JSMCP_API_KEY;
  const file = process.env.STRAP_JSMCP_API_KEY_FILE || path.join(os.homedir(), ".config", "jsmcp", "api-key.txt");
  return fs.readFileSync(file, "utf8").trim();
}

export function ensureMemory(state) {
  state.runtime ??= {};
  state.runtime.jsmcp ??= {};
  state.runtime.jsmcp.sessionId ??= randomUUID();
  state.runtime.jsmcp.cachedListTools ??= {};
  return state.runtime.jsmcp;
}

export async function callJsmcpHttp(tool, input = {}, state) {
  const memory = ensureMemory(state);
  const url = new URL(`/api/call`, endpoint());
  url.searchParams.set("tool", tool);
  url.searchParams.set("sessionId", memory.sessionId);
  if (process.env.STRAP_JSMCP_PROFILE) url.searchParams.set("profile", process.env.STRAP_JSMCP_PROFILE);
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "X-JSMCP-API-Key": apiKey() },
    body: JSON.stringify(input || {}),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || `jsmcp HTTP ${response.status}`);
  if (json.isError) throw new Error(json.structuredContent?.error || json.content?.[0]?.text || "jsmcp call failed");
  return json;
}

export function asJsonRpcResult(result) {
  return { result };
}
