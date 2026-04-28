import fs from "node:fs";
import path from "node:path";
import { strapAgentDirs, strapWorkRoot } from "#strap/core/paths";

export function agentRoots() {
  return strapAgentDirs();
}

export function listAgents({ includePaths = false } = {}) {
  const seen = new Set();
  const agents = [];
  for (const root of agentRoots()) {
    if (!isDirectory(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const name = path.basename(entry.name, ".md");
      if (seen.has(name)) continue;
      seen.add(name);
      const file = path.join(root, entry.name);
      const profile = readAgentFile(file, name);
      agents.push(publicAgent(profile, includePaths));
    }
  }
  return agents.sort((a, b) => a.name.localeCompare(b.name));
}

export function loadAgent(name, { includePaths = false } = {}) {
  for (const root of agentRoots()) {
    const file = path.join(root, `${name}.md`);
    if (fs.existsSync(file)) return includePaths ? readAgentFile(file, name) : publicAgent(readAgentFile(file, name), false);
  }
  throw new Error(`Agent not found: ${name}`);
}

export function applyAgentProfile(state, profile, actorId = "assistant") {
  const actor = state.actors[actorId] || { kind: "agent", self: {}, peers: {} };
  actor.kind = "agent";
  actor.agent = profile.name;
  actor.agent_profile = {
    name: profile.name,
    description: profile.description,
    source: profile.source,
  };
  actor.self ||= {};
  actor.self.public = profile.description || actor.self.public || `${profile.name} agent.`;
  actor.self.private = profile.instructions;
  if (profile.permission) actor.permission = profile.permission;
  state.actors[actorId] = actor;
  return state;
}

export function importOpenCodeAgents(sourceDir) {
  if (!isDirectory(sourceDir)) throw new Error(`OpenCode agents directory not found: ${sourceDir}`);
  const target = path.join(strapWorkRoot(), "agents");
  fs.mkdirSync(target, { recursive: true });
  const imported = [];
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const from = path.join(sourceDir, entry.name);
    const to = path.join(target, entry.name);
    fs.copyFileSync(from, to);
    imported.push({ name: path.basename(entry.name, ".md"), path: to });
  }
  return { ok: true, imported };
}

export function readAgentFile(file, name = path.basename(file, ".md")) {
  const text = fs.readFileSync(file, "utf8");
  const { meta, body } = parseMarkdownFrontmatter(text);
  return {
    name: meta.name || name,
    description: meta.description || "",
    permission: meta.permission,
    color: meta.color,
    instructions: body.trim(),
    source: path.basename(file),
    path: file,
    meta,
  };
}

function publicAgent(profile, includePaths) {
  return {
    name: profile.name,
    description: profile.description,
    permission: profile.permission,
    color: profile.color,
    instructions: profile.instructions,
    source: profile.source,
    ...(includePaths ? { path: profile.path } : {}),
  };
}

function parseMarkdownFrontmatter(text) {
  if (!text.startsWith("---\n")) return { meta: {}, body: text };
  const end = text.indexOf("\n---", 4);
  if (end === -1) return { meta: {}, body: text };
  return { meta: parseSimpleYaml(text.slice(4, end)), body: text.slice(end + 4).trimStart() };
}

function parseSimpleYaml(text) {
  const root = {};
  let currentObject;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const nested = line.match(/^\s+([A-Za-z0-9_-]+):\s*(.*)$/);
    if (nested && currentObject) {
      currentObject[nested[1]] = parseScalar(nested[2]);
      continue;
    }
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (!raw) {
      root[key] = {};
      currentObject = root[key];
    } else {
      root[key] = parseScalar(raw);
      currentObject = undefined;
    }
  }
  return root;
}

function parseScalar(value) {
  const text = String(value || "").trim();
  if (text === "true") return true;
  if (text === "false") return false;
  return text.replace(/^"|"$/g, "");
}

function isDirectory(dir) {
  return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
}
