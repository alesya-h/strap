#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { strapProjectRoot, strapRoot, strapWorkRoot } from "#strap/core/paths";

const [command, ...args] = process.argv.slice(2);
const markdownCommands = new Set(["create", "list", "get", "update", "delete", "tags", "search", "search-text", "search-vector", "search-hybrid", "reindex", "remember-state", "tool"]);

if (!markdownCommands.has(command)) usage();

if (command === "create") createNote();
else if (command === "list") listNotes();
else if (command === "get") getNote();
else if (command === "update") updateNote();
else if (command === "delete") deleteNote();
else if (command === "tags") listTags();
else if (command === "search") searchNotes();
else if (["search-text", "search-vector", "search-hybrid"].includes(command)) indexSearch(command);
else if (command === "reindex") reindexNotes();
else if (command === "remember-state") rememberState();
else if (command === "tool") tool();

function usage() {
  console.error("Usage: strap zk <create|list|get|update|delete|tags|search|search-hybrid|reindex|remember-state|tool> [args]");
  process.exit(2);
}

function createNote() {
  const scope = takeOption(args, "--scope", "user");
  const title = takeOption(args, "--title");
  const body = takeOption(args, "--body", readStdinIfAny());
  const tags = parseList(takeOption(args, "--tags", ""));
  const aliases = parseList(takeOption(args, "--aliases", ""));
  const author = takeOption(args, "--author", "agent");
  const id = takeOption(args, "--id", `zk_${crypto.randomUUID()}`);
  if (!title) throw new Error("Usage: strap zk create --title <title> [--body body] [--scope user|project]");
  const dir = zettelDir(scope);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${slug(title)}-${id.slice(3, 11)}.md`);
  const now = new Date().toISOString();
  writeNote(file, { id, title, tags, aliases, author, scope, created_at: now, updated_at: now }, body || "");
  writeJson({ ok: true, id, title, scope, path: file });
}

function listNotes() {
  const scope = takeOption(args, "--scope", "all");
  const tag = takeOption(args, "--tag", "");
  const limit = Number(takeOption(args, "--limit", "50"));
  const notes = readNotes(scope)
    .map(publicNote)
    .filter((note) => !tag || (note.tags || []).includes(tag))
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
    .slice(0, limit);
  writeJson(notes);
}

function getNote() {
  const match = findOne(args[0] || takeOption(args, "--id"));
  writeJson({ ...match.meta, path: match.file, body: match.body });
}

function updateNote() {
  const id = args[0] || takeOption(args, "--id");
  const match = findOne(id);
  const title = takeOption(args, "--title", match.meta.title || "");
  const body = takeOption(args, "--body", match.body);
  const tagsRaw = takeOption(args, "--tags");
  const aliasesRaw = takeOption(args, "--aliases");
  const author = takeOption(args, "--author", match.meta.author || "agent");
  const nextMeta = {
    ...match.meta,
    title,
    tags: tagsRaw === undefined ? (match.meta.tags || []) : parseList(tagsRaw),
    aliases: aliasesRaw === undefined ? (match.meta.aliases || []) : parseList(aliasesRaw),
    author,
    updated_at: new Date().toISOString(),
  };
  writeNote(match.file, nextMeta, body || "");
  writeJson({ ok: true, id: nextMeta.id, title: nextMeta.title, path: match.file });
}

function deleteNote() {
  const match = findOne(args[0] || takeOption(args, "--id"));
  fs.rmSync(match.file);
  writeJson({ ok: true, id: match.meta.id, deleted: match.file });
}

function listTags() {
  const counts = new Map();
  for (const note of readNotes("all")) {
    for (const tag of note.meta.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  writeJson([...counts.entries()].map(([tag, notes]) => ({ tag, notes })).sort((a, b) => b.notes - a.notes || a.tag.localeCompare(b.tag)));
}

function searchNotes() {
  const scope = takeOption(args, "--scope", "all");
  const limit = Number(takeOption(args, "--limit", "10"));
  const query = takeOption(args, "--query", "") || args.join(" ");
  if (!query) usage();
  const needle = query.toLowerCase();
  writeJson(readNotes(scope)
    .map((note) => ({ ...publicNote(note), score: countMatches(`${note.meta.title}\n${note.body}`, needle), excerpt: excerpt(`${note.meta.title}\n${note.body}`, needle) }))
    .filter((note) => note.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit));
}

function indexSearch(searchCommand) {
  const scope = takeOption(args, "--scope", "all");
  const db = takeOption(args, "--db", "");
  const limit = takeOption(args, "--limit", "10");
  const query = takeOption(args, "--query", "") || args.join(" ");
  if (!query) usage();
  reindex({ scope, db, quiet: true });
  const child = runIndex([searchCommand, query, "--limit", limit, ...(db ? ["--db", db] : [])]);
  process.stdout.write(child.stdout);
}

function reindexNotes() {
  const scope = takeOption(args, "--scope", "all");
  const db = takeOption(args, "--db", "");
  writeJson(reindex({ scope, db, quiet: false }));
}

function rememberState() {
  const file = takeOption(args, "--file", "");
  const title = takeOption(args, "--title", "");
  const tags = takeOption(args, "--tags", "session,summary");
  const author = takeOption(args, "--author", "agent");
  const scope = takeOption(args, "--scope", "user");
  const raw = file ? fs.readFileSync(file, "utf8") : readStdinIfAny();
  const state = JSON.parse(raw);
  const event = lastTextEvent(state);
  if (!event) throw new Error("No text event found in state");
  const noteTitle = title || event.text.split(/\r?\n/)[0].slice(0, 80);
  const id = `zk_${crypto.randomUUID()}`;
  const dir = zettelDir(scope);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${slug(noteTitle)}-${id.slice(3, 11)}.md`);
  const now = new Date().toISOString();
  writeNote(out, { id, title: noteTitle, tags: parseList(tags), aliases: [], author, scope, created_at: now, updated_at: now }, event.text || "");
  writeJson({ ok: true, id, title: noteTitle, scope, path: out });
}

function tool() {
  const req = JSON.parse(readStdinIfAny() || "{}");
  const action = req.action || "search_hybrid";
  const map = {
    create: () => invokeSelf(["create", "--scope", req.scope || "user", "--title", req.title, "--body", req.body || "", "--tags", JSON.stringify(req.tags || []), "--aliases", JSON.stringify(req.aliases || []), "--author", req.author || "agent"]),
    update: () => invokeSelf(["update", req.id, ...(req.title ? ["--title", req.title] : []), ...(req.body ? ["--body", req.body] : []), ...(req.tags ? ["--tags", JSON.stringify(req.tags)] : []), ...(req.aliases ? ["--aliases", JSON.stringify(req.aliases)] : [])]),
    delete: () => invokeSelf(["delete", req.id]),
    list: () => invokeSelf(["list", "--scope", req.scope || "all", "--limit", String(req.limit || 50), ...(req.tag ? ["--tag", req.tag] : [])]),
    tags: () => invokeSelf(["tags"]),
    get: () => invokeSelf(["get", req.id]),
    search: () => invokeSelf(["search", req.query, "--scope", req.scope || "all", "--limit", String(req.limit || 10)]),
    search_hybrid: () => invokeSelf(["search-hybrid", req.query, "--scope", req.scope || "all", "--limit", String(req.limit || 10), ...(req.db ? ["--db", req.db] : [])]),
    reindex: () => invokeSelf(["reindex", "--scope", req.scope || "all", ...(req.db ? ["--db", req.db] : [])]),
  };
  if (!map[action]) throw new Error(`Unknown zk action: ${action}`);
  process.stdout.write(map[action]());
}

function reindex({ scope, db, quiet }) {
  const dbPath = db || defaultDbPath();
  for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${dbPath}${suffix}`, { force: true });
  const notes = readNotes(scope);
  for (const note of notes) {
    runIndex(["create", "--id", note.meta.id, "--title", note.meta.title, "--body", note.body, "--tags", JSON.stringify(note.meta.tags || []), "--aliases", JSON.stringify(note.meta.aliases || []), "--author", note.meta.author || "agent", "--db", dbPath]);
  }
  return { ok: true, reindexed: notes.length, scope, db: dbPath };
}

function runIndex(indexArgs) {
  const child = spawnSync("nu", [path.join(strapRoot(), "subprojects", "zettel", "bin", "zk.nu"), ...indexArgs], { encoding: "utf8", env: { ...process.env, STRAP_ZK_DB: process.env.STRAP_ZK_DB || defaultDbPath() } });
  if (child.status !== 0) throw new Error(child.stderr || child.stdout || `zk index exited ${child.status}`);
  return child;
}

function invokeSelf(selfArgs) {
  const child = spawnSync(process.execPath, [new URL(import.meta.url).pathname, ...selfArgs], { encoding: "utf8", env: process.env });
  if (child.status !== 0) throw new Error(child.stderr || child.stdout || `zk tool action exited ${child.status}`);
  return child.stdout;
}

function zettelDir(scope) {
  if (scope === "project") return path.join(strapProjectRoot(), "zettel");
  if (scope === "user") return path.join(strapWorkRoot(), "zettel");
  throw new Error("scope must be user or project");
}

function readNotes(scope) {
  const dirs = scope === "all" ? [zettelDir("project"), zettelDir("user")] : [zettelDir(scope)];
  return dirs.flatMap((dir) => markdownFiles(dir).map((file) => ({ file, ...parseNote(fs.readFileSync(file, "utf8")) }))).filter((note) => note.meta.id);
}

function findOne(id) {
  if (!id) usage();
  const matches = readNotes("all").filter((note) => note.meta.id === id || note.file.endsWith(id) || path.basename(note.file, ".md") === id);
  if (matches.length === 0) throw new Error(`Markdown note not found: ${id}`);
  if (matches.length > 1) throw new Error(`Ambiguous markdown note: ${id}`);
  return matches[0];
}

function markdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(file);
    return entry.isFile() && entry.name.endsWith(".md") ? [file] : [];
  });
}

function writeNote(file, meta, body) {
  fs.writeFileSync(file, `---\n${formatFrontmatter(meta)}---\n\n${body.trim()}\n`);
}

function parseNote(text) {
  if (!text.startsWith("---\n")) return { meta: {}, body: text };
  const end = text.indexOf("\n---", 4);
  if (end === -1) return { meta: {}, body: text };
  return { meta: parseFrontmatter(text.slice(4, end)), body: text.slice(end + 4).trimStart() };
}

function parseFrontmatter(text) {
  const meta = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    meta[key] = raw.startsWith("[") ? parseList(raw) : raw.replace(/^"|"$/g, "");
  }
  return meta;
}

function formatFrontmatter(meta) {
  return Object.entries(meta).map(([key, value]) => `${key}: ${Array.isArray(value) ? JSON.stringify(value) : JSON.stringify(String(value))}`).join("\n") + "\n";
}

function publicNote({ file, meta, body }) {
  return { ...meta, path: file, excerpt: body.trim().slice(0, 160) };
}

function parseList(value) {
  if (Array.isArray(value)) return value;
  const text = String(value || "").trim();
  if (!text) return [];
  if (text.startsWith("[")) return JSON.parse(text);
  return text.split(",").map((item) => item.trim()).filter(Boolean);
}

function slug(text) {
  return String(text || "note").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "note";
}

function defaultDbPath() {
  return process.env.STRAP_ZK_DB || path.join(strapWorkRoot(), "zettel", "zettel.sqlite");
}

function takeOption(values, name, fallback = undefined) {
  const index = values.indexOf(name);
  if (index === -1) return fallback;
  const value = values[index + 1];
  values.splice(index, 2);
  return value;
}

function readStdinIfAny() {
  return process.stdin.isTTY ? "" : fs.readFileSync(0, "utf8");
}

function countMatches(text, needle) {
  return text.toLowerCase().split(needle).length - 1;
}

function excerpt(text, needle) {
  const index = text.toLowerCase().indexOf(needle);
  if (index === -1) return text.slice(0, 160);
  return text.slice(Math.max(0, index - 60), index + needle.length + 100);
}

function lastTextEvent(state) {
  const children = state?.root?.children || [];
  const assistant = children.filter((event) => event.type === "event" && event.from === "assistant" && event.text);
  if (assistant.length) return assistant.at(-1);
  return children.filter((event) => event.type === "event" && event.text).at(-1);
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
