#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const provider = "chatgpt";
const [command, ...args] = process.argv.slice(2);
main().catch((error) => { process.stderr.write(`${error.message || error}\n`); process.exit(1); });

async function main() {
  if (command === "auth") return writeJson(await auth(args));
  if (command === "embed") return writeJson(await embed(args));
  if (!["compile", "call", "complete"].includes(command || "")) usage();
  const modelName = takeOption(args, "--model", "current");
  const toolsName = takeOption(args, "--tools", "all");
  const state = await readJson(takeOption(args, "--file", "-"));
  const config = loadModel(modelName);
  if (config.provider !== provider) throw new Error(`Model profile provider mismatch: expected ${provider}, got ${config.provider}`);
  const body = { model: config.model, input: responsesInput(state), instructions: actorFrame(state), store: false, stream: true, ...(loadTools(toolsName).length ? { tools: loadTools(toolsName).map(t => ({ type: "function", name: t.name, description: t.description, parameters: t.inputSchema })) } : {}), ...(config.parameters || {}) };
  if (command === "compile") return writeJson(body);
  const response = await call(config, body);
  if (command === "call") return writeJson(response);
  state.root.children.push({ type: "event", ...responseToEvent(response) });
  writeJson(state);
}

async function embed(args) {
  const model = takeOption(args, "--model", process.env.STRAP_EMBED_MODEL || process.env.STRAP_ZK_EMBED_MODEL || "text-embedding-3-small");
  const dimensions = takeOption(args, "--dimensions", process.env.STRAP_EMBED_DIMENSIONS || process.env.STRAP_ZK_EMBED_DIMENSIONS);
  const profile = takeOption(args, "--profile", process.env.STRAP_ZK_CHATGPT_MODEL || process.env.STRAP_CHATGPT_MODEL || "current");
  const config = loadModel(profile);
  if (config.provider !== provider) throw new Error(`Embedding auth profile provider mismatch: expected ${provider}, got ${config.provider}`);
  const input = await readOptionalJson(takeOption(args, "--file", "-"));
  const texts = Array.isArray(input.texts) ? input.texts.map(String) : [String(input.text ?? "")];
  const body = { model, input: texts };
  if (dimensions) body.dimensions = Number(dimensions);
  const payload = await postJson("https://api.openai.com/v1/embeddings", await headers(config), body, "chatgpt embeddings failed");
  const embeddings = payload.data?.map(item => item.embedding) || [];
  return { model, dimensions: embeddings[0]?.length || 0, embeddings };
}

async function call(config, body) {
  let response = await fetch(config.base_url, { method: "POST", headers: { ...await headers(config), "content-type": "application/json" }, body: JSON.stringify(body) });
  if (response.status === 401) {
    await loadToken({ ...config.auth, force_refresh: true });
    response = await fetch(config.base_url, { method: "POST", headers: { ...await headers(config), "content-type": "application/json" }, body: JSON.stringify(body) });
  }
  if (!response.ok) throw new Error(`Provider call failed: ${response.status}: ${await response.text()}`);
  if (config.stream) return readStream(response, config);
  return response.json();
}

async function headers(config) {
  const token = await loadToken(config.auth || { type: "chatgpt_oauth" });
  return { Authorization: `Bearer ${token.access_token}`, ...(token.account_id ? { "ChatGPT-Account-Id": token.account_id } : {}) };
}

async function postJson(url, headers, body, label = "Provider call failed") { const r = await fetch(url, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) }); const t = await r.text(); if (!r.ok) throw new Error(`${label}: ${r.status}: ${t}`); return JSON.parse(t || "{}"); }

async function readStream(response, config) {
  const reader = response.body?.getReader();
  if (!reader) return response.json();
  const decoder = new TextDecoder();
  let buffer = "";
  let outputText = "";
  const output = [];
  let completed;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let event;
      try { event = JSON.parse(data); } catch { continue; }
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") outputText += event.delta;
      if (event.type === "response.output_text.done" && typeof event.text === "string") outputText ||= event.text;
      if (event.type === "response.content_part.done" && typeof event.part?.text === "string") outputText ||= event.part.text;
      if (event.type === "response.output_item.done") {
        const itemText = (event.item?.content || []).map(part => part.text || "").join("\n");
        if (itemText) outputText ||= itemText;
        if (event.item?.type === "function_call") output.push(event.item);
      }
      if (event.type === "response.completed") completed = event.response || event;
    }
  }
  if (completed) {
    if (!completed.output_text && outputText) completed.output_text = outputText;
    if ((!completed.output || completed.output.length === 0) && output.length) completed.output = output;
    return completed;
  }
  return { model: config.model, output_text: outputText, output: [{ type: "message", content: [{ type: "output_text", text: outputText }] }] };
}

function responseToEvent(response) { const output = response.output || []; const text = response.output_text || output.flatMap(item => item.content || []).filter(part => part.type === "output_text" || part.type === "text").map(part => part.text || "").join("\n"); const calls = output.filter(item => item.type === "function_call").map(item => ({ id: item.call_id || item.id, tool: item.name, input: parseObject(item.arguments), provider: { type: item.type, id: item.id, call_id: item.call_id } })); return { from: "assistant", to: calls.length ? ["harness"] : ["user"], kind: calls.length ? "tool_request" : "message", text, calls: calls.length ? calls : undefined, provider: { name: "openai.responses", id: response.id, model: response.model, usage: response.usage } }; }
function responsesInput(state) { const input = []; for (const e of flatten(state.root)) { if (e.from === "assistant" && e.calls?.length) { if (e.text) input.push({ role: "assistant", content: e.text }); for (const c of e.calls) { input.push({ type: "function_call", id: c.provider?.id || c.id, call_id: c.provider?.call_id || c.id, name: c.tool, arguments: JSON.stringify(c.input || {}) }); if (c.ok !== undefined) input.push({ type: "function_call_output", call_id: c.provider?.call_id || c.id, output: toolResult(c) }); } } else if (e.text || eventText(e)) input.push({ role: e.from === "assistant" ? "assistant" : "user", content: e.text || eventText(e) }); } return input; }
function toolResult(c) { if (!c.ok) return JSON.stringify({ ok: false, error: c.error || "Tool call failed" }); if (typeof c.output === "string") return c.output; const parts = c.output?.content?.filter(p => p.type === "text" && typeof p.text === "string")?.map(p => p.text); return parts?.length ? parts.join("\n") : JSON.stringify(c.output ?? null); }

async function auth(args) {
  const action = args.shift();
  const tokenFile = takeOption(args, "--token-file", defaultTokenFile());
  if (action === "login") return login({ token_file: tokenFile, open: !takeFlag(args, "--no-open"), timeout_seconds: Number(takeOption(args, "--timeout-seconds", "300")), onUserCode: ({ userCode, url }) => process.stderr.write(`Open ${url} and enter code: ${userCode}\n`) });
  if (action === "import-codex") return importCodex({ auth_file: takeOption(args, "--auth-file"), token_file: tokenFile });
  if (action === "refresh") { const t = await loadToken({ token_file: tokenFile, refresh: false }); const r = await refreshToken({ token: t, tokenFile: expandHome(tokenFile) }); return { tokenFile: expandHome(tokenFile), ...summary(r) }; }
  if (action === "show") { const t = await loadToken({ token_file: tokenFile, refresh: false }); return { tokenFile: expandHome(tokenFile), ...summary(t) }; }
  if (action === "logout") { await fsp.rm(expandHome(tokenFile), { force: true }); return { ok: true, tokenFile: expandHome(tokenFile) }; }
  throw new Error("Usage: strap provider chatgpt auth <login|import-codex|refresh|show|logout> [--token-file file]");
}

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const ISSUER = "https://auth.openai.com";
const DEVICE_URL = `${ISSUER}/codex/device`;
const REDIRECT_URI = "https://auth.openai.com/deviceauth/callback";
function defaultTokenFile() { return path.join(os.homedir(), ".config", "strap", "auth", "chatgpt.json"); }
async function loadToken({ token_file, refresh = true, refresh_margin_seconds = 120, force_refresh = false } = {}) { const tokenFile = expandHome(token_file || defaultTokenFile()); let t = JSON.parse(fs.readFileSync(tokenFile, "utf8")); if (force_refresh || shouldRefresh(t, refresh_margin_seconds)) { if (refresh === false) throw new Error("ChatGPT token is expired/near expiry and refresh=false"); t = await refreshToken({ token: t, tokenFile }); } if (!t.access_token) throw new Error("ChatGPT token file is missing access_token"); return normalizeToken(t); }
async function saveToken(token, tokenFile = defaultTokenFile()) { const file = expandHome(tokenFile); const next = normalizeToken(token); await fsp.mkdir(path.dirname(file), { recursive: true, mode: 0o700 }); await fsp.writeFile(file, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 }); return { tokenFile: file, token: next }; }
async function refreshToken({ token, tokenFile = defaultTokenFile(), refresh_url = `${ISSUER}/oauth/token` }) { if (!token.refresh_token) throw new Error("ChatGPT token file is missing refresh_token"); const form = new URLSearchParams({ grant_type: "refresh_token", refresh_token: token.refresh_token, client_id: CLIENT_ID }); const r = await fetch(refresh_url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form.toString() }); const text = await r.text(); if (!r.ok) throw new Error(`ChatGPT token refresh failed: ${r.status}: ${text}`); const next = normalizeToken({ ...token, ...JSON.parse(text) }); if (!next.refresh_token) next.refresh_token = token.refresh_token; await saveToken(next, tokenFile); return next; }
async function login({ token_file, open = true, timeout_seconds = 300, poll_interval_seconds = 5, onUserCode } = {}) { const usercode = await postJson(`${ISSUER}/api/accounts/deviceauth/usercode`, {}, { client_id: CLIENT_ID }, "Request failed"); const deviceAuthId = usercode.device_auth_id; const userCode = usercode.user_code; if (!deviceAuthId || !userCode) throw new Error("ChatGPT login response missing device auth fields"); if (onUserCode) onUserCode({ userCode, url: DEVICE_URL }); if (open) openUrl(DEVICE_URL); const ex = await poll({ deviceAuthId, userCode, timeout_seconds, poll_interval_seconds }); const form = new URLSearchParams({ grant_type: "authorization_code", code: ex.authorization_code, redirect_uri: REDIRECT_URI, client_id: CLIENT_ID, code_verifier: ex.code_verifier }); const r = await fetch(`${ISSUER}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form.toString() }); const text = await r.text(); if (!r.ok) throw new Error(`ChatGPT token exchange failed: ${r.status}: ${text}`); const saved = await saveToken(JSON.parse(text), token_file); return { tokenFile: saved.tokenFile, accountId: saved.token.account_id, expiresAt: saved.token.expires_at }; }
async function importCodex({ auth_file, token_file } = {}) { const authFile = expandHome(auth_file || path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "auth.json")); const doc = JSON.parse(fs.readFileSync(authFile, "utf8")); if (doc.OPENAI_API_KEY) throw new Error("Codex auth file contains API-key auth, not ChatGPT OAuth auth"); if (!doc.tokens?.access_token) throw new Error("Codex auth file is missing tokens.access_token"); const saved = await saveToken({ access_token: doc.tokens.access_token, refresh_token: doc.tokens.refresh_token, id_token: doc.tokens.id_token?.raw_jwt || doc.tokens.id_token, account_id: doc.tokens.account_id }, token_file); return { tokenFile: saved.tokenFile, accountId: saved.token.account_id, expiresAt: saved.token.expires_at }; }
async function poll({ deviceAuthId, userCode, timeout_seconds, poll_interval_seconds }) { const deadline = Date.now() + timeout_seconds * 1000; while (Date.now() < deadline) { const r = await fetch(`${ISSUER}/api/accounts/deviceauth/token`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", "user-agent": "strap/0.1.0" }, body: JSON.stringify({ device_auth_id: deviceAuthId, user_code: userCode }) }); const text = await r.text(); if (r.status === 200) { const body = JSON.parse(text); if (!body.authorization_code || !body.code_verifier) throw new Error("ChatGPT authorization did not return exchange credentials"); return body; } if (![403, 404].includes(r.status)) throw new Error(`ChatGPT authorization failed: ${r.status}: ${text}`); await new Promise(resolve => setTimeout(resolve, Math.max(1, poll_interval_seconds) * 1000)); } throw new Error("Timed out waiting for ChatGPT device authorization"); }
function summary(t) { const n = normalizeToken(t); return { accountId: n.account_id, expiresAt: n.expires_at }; }
function normalizeToken(t) { const n = snake(t || {}); n.account_id ||= accountId(n.id_token || n.access_token); if (!n.expires_at && n.expires_in) n.expires_at = Math.floor(Date.now() / 1000) + Number(n.expires_in) - 30; return n; }
function shouldRefresh(t, margin) { const exp = t.expires_at || decodeJwt(t.access_token)?.exp; return exp ? exp * 1000 - Date.now() < margin * 1000 : false; }
function accountId(jwt) { const c = decodeJwt(jwt) || {}; const a = c["https://api.openai.com/auth"] || {}; return a.chatgpt_account_id || c.organizations?.[0]?.id; }
function decodeJwt(jwt) { if (typeof jwt !== "string") return undefined; const p = jwt.split("."); if (p.length < 2) return undefined; try { return JSON.parse(Buffer.from(p[1].replaceAll("-", "+").replaceAll("_", "/"), "base64").toString("utf8")); } catch { return undefined; } }
function snake(o) { return Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`), v])); }
function openUrl(url) { const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open"; const a = process.platform === "win32" ? ["/c", "start", "", url] : [url]; try { const child = spawn(opener, a, { detached: true, stdio: "ignore" }); child.unref(); } catch {} }

function usage() { process.stderr.write("Usage: strap provider chatgpt <compile|call|complete|embed|auth> [args]\n"); process.exit(2); }
function loadModel(name) { const c = JSON.parse(fs.readFileSync(modelFile(name), "utf8")); return { ...c, api: c.api || "responses", model: c.model_id, base_url: c.base_url || "https://chatgpt.com/backend-api/codex/responses", auth: c.auth || { type: "chatgpt_oauth" }, stream: c.stream ?? true }; }
function modelFile(name) { const e = expandHome(name); if (e.endsWith(".json") || e.includes("/")) { const d = path.resolve(e); if (fs.existsSync(d)) return d; } const f = name.endsWith(".json") ? name : `${name}.json`; for (const r of modelRoots()) { const p = path.join(r, f); if (fs.existsSync(p)) return p; } throw new Error(`Model profile not found: ${name}`); }
function modelRoots() { return [...(process.env.STRAP_MODEL_PATH || "").split(path.delimiter).filter(Boolean), ...maybe(sessionOverlay(), "models"), path.join(workRoot(), "models"), path.join(projectRoot(), "models"), path.join(globalRoot(), "models"), path.join(root(), "config", "strap", "models")]; }
function loadTools(group) { if (group === "none") return []; if (group && !["all", "fs", "process", "web", "agent", "scripts", "jsmcp"].includes(group)) { const p = JSON.parse(fs.readFileSync(group, "utf8")); return Array.isArray(p) ? p : p.tools || []; } const source = `import { getTools, publicToolSpec } from "#strap/tools/registry"; console.log(JSON.stringify(getTools(${JSON.stringify(group || "all")}).map(publicToolSpec)));`; const r = spawnSync(process.execPath, ["--input-type=module", "-e", source], { cwd: root(), encoding: "utf8", env: process.env }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return JSON.parse(r.stdout || "[]"); }
async function readJson(file) { const text = file && file !== "-" ? fs.readFileSync(file, "utf8") : await stdin(); if (!text.trim()) throw new Error("Expected JSON state on stdin"); return JSON.parse(text); }
async function readOptionalJson(file) { const text = file && file !== "-" ? fs.readFileSync(file, "utf8") : await stdin(); return text.trim() ? JSON.parse(text) : {}; }
async function stdin() { const chunks = []; for await (const c of process.stdin) chunks.push(c); return Buffer.concat(chunks).toString("utf8"); }
function writeJson(v) { process.stdout.write(`${JSON.stringify(v, null, 2)}\n`); }
function actorFrame(state) { const a = state.actors?.assistant || {}; const out = []; if (a.self?.public) out.push(`<self_public>\n${a.self.public}\n</self_public>`); if (a.self?.private) out.push(`<self_private>\n${a.self.private}\n</self_private>`); for (const [p, r] of Object.entries(a.peers || {})) if (r.contract) out.push(`<contract peer="${p}">\n${r.contract}\n</contract>`); return out.join("\n\n"); }
function flatten(n, out = []) { if (!n) return out; if (n.type === "event") out.push(n); else if (n.type === "scope") { if (n.status === "collapsed") out.push({ type: "event", from: "harness", to: n.participants || [], kind: "summary", text: n.summary || `[collapsed scope: ${n.label}]` }); else for (const c of n.children || []) flatten(c, out); } return out; }
function eventText(e) { return `[${e.from} -> ${Array.isArray(e.to) ? e.to.join(",") : e.to || "all"}; ${e.kind || "message"}]\n${e.text || ""}`.trim(); }
function parseObject(v) { if (!v) return {}; if (typeof v === "object") return v; try { return JSON.parse(v); } catch { return { raw: String(v) }; } }
function takeOption(a, n, d) { const i = a.indexOf(n); if (i < 0) return d; const v = a[i + 1]; a.splice(i, v === undefined ? 1 : 2); return v === undefined ? d : v; }
function takeFlag(a, n) { const i = a.indexOf(n); if (i < 0) return false; a.splice(i, 1); return true; }
function root() { return path.resolve(process.env.STRAP_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../..")); }
function workspace() { return path.resolve(process.env.STRAP_WORKSPACE || process.cwd()); }
function globalRoot() { return process.env.STRAP_GLOBAL ? path.resolve(process.env.STRAP_GLOBAL) : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "strap"); }
function nearest(name) { let c = workspace(); while (true) { const p = path.join(c, name); if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p; const parent = path.dirname(c); if (parent === c) return undefined; c = parent; } }
function projectRoot() { return process.env.STRAP_PROJECT ? path.resolve(process.env.STRAP_PROJECT) : nearest(".strap") || path.join(workspace(), ".strap"); }
function workRoot() { return process.env.STRAP_WORK ? path.resolve(process.env.STRAP_WORK) : nearest(".strap-user") || path.join(workspace(), ".strap-user"); }
function sessionOverlay() { return process.env.STRAP_SESSION ? path.join(path.resolve(process.env.STRAP_SESSION), "overlay") : undefined; }
function maybe(r, n) { return r ? [path.join(r, n)] : []; }
function expandHome(p) { return p?.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p; }
