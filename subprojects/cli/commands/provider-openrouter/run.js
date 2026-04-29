#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const provider = "openrouter";
const [command, ...args] = process.argv.slice(2);
main().catch((error) => { process.stderr.write(`${error.message || error}\n`); process.exit(1); });

async function main() {
  if (!["compile", "call", "complete"].includes(command || "")) usage();
  const modelName = takeOption(args, "--model", "current");
  const toolsName = takeOption(args, "--tools", "all");
  const state = await readJson(takeOption(args, "--file", "-"));
  const config = loadModel(modelName);
  if (config.provider !== provider) throw new Error(`Model profile provider mismatch: expected ${provider}, got ${config.provider}`);
  const body = { model: config.model, messages: chatMessages(state), ...(loadTools(toolsName).length ? { tools: loadTools(toolsName).map(t => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } })) } : {}), ...(config.parameters || {}) };
  if (command === "compile") return writeJson(body);
  const headers = { Authorization: `Bearer ${secret(config.auth || { env: "OPENROUTER_API_KEY" })}` };
  if (config.site_url) headers["HTTP-Referer"] = config.site_url;
  if (config.app_name) headers["X-Title"] = config.app_name;
  const response = await postJson(config.base_url, headers, body);
  if (command === "call") return writeJson(response);
  state.root.children.push({ type: "event", ...responseToEvent(response, config) });
  writeJson(state);
}

function responseToEvent(response, config) { const m = response.choices?.[0]?.message || {}; const calls = (m.tool_calls || []).map(c => ({ id: c.id, tool: c.function?.name, input: parseObject(c.function?.arguments), provider: { type: c.type, id: c.id } })); return { from: "assistant", to: calls.length ? ["harness"] : ["user"], kind: calls.length ? "tool_request" : "message", text: m.content || "", calls: calls.length ? calls : undefined, provider: { name: `${provider}.chat`, id: response.id, model: response.model, usage: response.usage } }; }
function usage() { process.stderr.write("Usage: strap provider openrouter <compile|call|complete> [args]\n"); process.exit(2); }
function loadModel(name) { const c = JSON.parse(fs.readFileSync(modelFile(name), "utf8")); return { ...c, api: c.api || "chat", model: c.model_id, base_url: c.base_url || "https://openrouter.ai/api/v1/chat/completions", auth: c.auth || { type: "api_key", env: "OPENROUTER_API_KEY" } }; }
function modelFile(name) { const e = expandHome(name); if (e.endsWith(".json") || e.includes("/")) { const d = path.resolve(e); if (fs.existsSync(d)) return d; } const f = name.endsWith(".json") ? name : `${name}.json`; for (const r of modelRoots()) { const p = path.join(r, f); if (fs.existsSync(p)) return p; } throw new Error(`Model profile not found: ${name}`); }
function modelRoots() { return [...(process.env.STRAP_MODEL_PATH || "").split(path.delimiter).filter(Boolean), ...maybe(sessionOverlay(), "models"), path.join(workRoot(), "models"), path.join(projectRoot(), "models"), path.join(globalRoot(), "models"), path.join(root(), "config", "strap", "models")]; }
function loadTools(group) { if (group === "none") return []; if (group && !["all", "fs", "process", "web", "agent", "scripts", "jsmcp"].includes(group)) { const p = JSON.parse(fs.readFileSync(group, "utf8")); return Array.isArray(p) ? p : p.tools || []; } const source = `import { getTools, publicToolSpec } from "#strap/tools/registry"; console.log(JSON.stringify(getTools(${JSON.stringify(group || "all")}).map(publicToolSpec)));`; const r = spawnSync(process.execPath, ["--input-type=module", "-e", source], { cwd: root(), encoding: "utf8", env: process.env }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return JSON.parse(r.stdout || "[]"); }
async function readJson(file) { const text = file && file !== "-" ? fs.readFileSync(file, "utf8") : await stdin(); if (!text.trim()) throw new Error("Expected JSON state on stdin"); return JSON.parse(text); }
async function stdin() { const chunks = []; for await (const c of process.stdin) chunks.push(c); return Buffer.concat(chunks).toString("utf8"); }
function writeJson(v) { process.stdout.write(`${JSON.stringify(v, null, 2)}\n`); }
async function postJson(url, headers, body) { const r = await fetch(url, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) }); const t = await r.text(); if (!r.ok) throw new Error(`Provider call failed: ${r.status}: ${t}`); return JSON.parse(t || "{}"); }
function secret(auth) { if (auth.value) return auth.value; if (auth.env && process.env[auth.env]) return process.env[auth.env]; if (auth.file) return fs.readFileSync(expandHome(auth.file), "utf8").trim(); throw new Error(`Missing environment variable: ${auth.env || "OPENROUTER_API_KEY"}`); }
function chatMessages(state) { return [{ role: "system", content: actorFrame(state) }, ...flatten(state.root).map(e => ({ role: e.from === "assistant" ? "assistant" : "user", content: eventText(e) }))]; }
function actorFrame(state) { const a = state.actors?.assistant || {}; const out = []; if (a.self?.public) out.push(`<self_public>\n${a.self.public}\n</self_public>`); if (a.self?.private) out.push(`<self_private>\n${a.self.private}\n</self_private>`); for (const [p, r] of Object.entries(a.peers || {})) if (r.contract) out.push(`<contract peer="${p}">\n${r.contract}\n</contract>`); return out.join("\n\n"); }
function flatten(n, out = []) { if (!n) return out; if (n.type === "event") out.push(n); else if (n.type === "scope") { if (n.status === "collapsed") out.push({ type: "event", from: "harness", to: n.participants || [], kind: "summary", text: n.summary || `[collapsed scope: ${n.label}]` }); else for (const c of n.children || []) flatten(c, out); } return out; }
function eventText(e) { return `[${e.from} -> ${Array.isArray(e.to) ? e.to.join(",") : e.to || "all"}; ${e.kind || "message"}]\n${e.text || ""}`.trim(); }
function parseObject(v) { if (!v) return {}; if (typeof v === "object") return v; try { return JSON.parse(v); } catch { return { raw: String(v) }; } }
function takeOption(a, n, d) { const i = a.indexOf(n); if (i < 0) return d; const v = a[i + 1]; a.splice(i, v === undefined ? 1 : 2); return v === undefined ? d : v; }
function root() { return path.resolve(process.env.STRAP_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../..")); }
function workspace() { return path.resolve(process.env.STRAP_WORKSPACE || process.cwd()); }
function globalRoot() { return process.env.STRAP_GLOBAL ? path.resolve(process.env.STRAP_GLOBAL) : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "strap"); }
function nearest(name) { let c = workspace(); while (true) { const p = path.join(c, name); if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p; const parent = path.dirname(c); if (parent === c) return undefined; c = parent; } }
function projectRoot() { return process.env.STRAP_PROJECT ? path.resolve(process.env.STRAP_PROJECT) : nearest(".strap") || path.join(workspace(), ".strap"); }
function workRoot() { return process.env.STRAP_WORK ? path.resolve(process.env.STRAP_WORK) : nearest(".strap-user") || path.join(workspace(), ".strap-user"); }
function sessionOverlay() { return process.env.STRAP_SESSION ? path.join(path.resolve(process.env.STRAP_SESSION), "overlay") : undefined; }
function maybe(r, n) { return r ? [path.join(r, n)] : []; }
function expandHome(p) { return p?.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p; }
