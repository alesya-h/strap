#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { strapProjectRoot, strapRoot, strapWorkRoot } from "#strap/core/paths";

const [command, ...args] = process.argv.slice(2);
const markdownCommands = new Set(["create", "list", "get", "update", "delete", "tags", "search", "search-text", "search-vector", "search-hybrid", "links", "backlinks", "status", "workon", "promote", "discard", "reindex", "remember-state", "tool"]);
let projectByIdCache;

if (!markdownCommands.has(command)) usage();

if (command === "create") createNote();
else if (command === "list") listNotes();
else if (command === "get") getNote();
else if (command === "update") updateNote();
else if (command === "delete") deleteNote();
else if (command === "tags") listTags();
else if (command === "search") searchNotes();
else if (["search-text", "search-vector", "search-hybrid"].includes(command)) indexSearch(command);
else if (command === "links") showLinks();
else if (command === "backlinks") showBacklinks();
else if (command === "status") showStatus();
else if (command === "workon") workonNote();
else if (command === "promote") promoteNote();
else if (command === "discard") discardNote();
else if (command === "reindex") reindexNotes();
else if (command === "remember-state") rememberState();
else if (command === "tool") tool();

function usage() {
  console.error("Usage: strap zk <create|list|get|update|delete|tags|search|search-hybrid|links|backlinks|status|workon|promote|discard|reindex|remember-state|tool> [args]");
  process.exit(2);
}

function createNote() {
  const scope = takeOption(args, "--scope", "user");
  const includePaths = takeFlag(args, "--paths");
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
  const visible = visibleNotes();
  const note = visible.find((item) => item.meta.id === id);
  writeJson({ ok: true, note: decorateNote(note, visible, { includeBody: false, includePaths }) });
}

function listNotes() {
  const includePaths = takeFlag(args, "--paths");
  const scope = takeOption(args, "--scope", "all");
  const tag = takeOption(args, "--tag", "");
  const limit = Number(takeOption(args, "--limit", "50"));
  const visible = visibleNotes(scope);
  const notes = visible
    .map((note) => decorateNote(note, visible, { includeBody: false, includePaths }))
    .filter((note) => !tag || (note.tags || []).includes(tag))
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
    .slice(0, limit);
  writeJson(notes);
}

function getNote() {
  const includePaths = takeFlag(args, "--paths");
  const visible = visibleNotes();
  const match = findVisible(args[0] || takeOption(args, "--id"), visible);
  writeJson(decorateNote(match, visible, { includeBody: true, includePaths }));
}

function updateNote() {
  const includePaths = takeFlag(args, "--paths");
  const id = args[0] || takeOption(args, "--id");
  const visible = visibleNotes();
  const current = findVisible(id, visible);
  const editable = ensureUserOverlay(current);
  const title = takeOption(args, "--title", editable.meta.title || "");
  const body = takeOption(args, "--body", editable.body);
  const tagsRaw = takeOption(args, "--tags");
  const aliasesRaw = takeOption(args, "--aliases");
  const author = takeOption(args, "--author", editable.meta.author || "agent");
  const nextMeta = {
    ...editable.meta,
    deleted: undefined,
    title,
    tags: tagsRaw === undefined ? (editable.meta.tags || []) : parseList(tagsRaw),
    aliases: aliasesRaw === undefined ? (editable.meta.aliases || []) : parseList(aliasesRaw),
    author,
    scope: "user",
    updated_at: new Date().toISOString(),
  };
  delete nextMeta.deleted;
  writeNote(editable.file, nextMeta, body || "");
  const nextVisible = visibleNotes();
  const updated = findVisible(nextMeta.id, nextVisible);
  writeJson({ ok: true, note: decorateNote(updated, nextVisible, { includeBody: false, includePaths }) });
}

function deleteNote() {
  const includePaths = takeFlag(args, "--paths");
  const id = args[0] || takeOption(args, "--id");
  const visible = visibleNotes();
  const current = findVisible(id, visible);
  if (current.layer === "user" && !current.projectFile) {
    fs.rmSync(current.file);
    writeJson({ ok: true, id: current.meta.id, deleted: true });
    return;
  }
  const tombstoneFile = current.layer === "user" ? current.file : userFileFor(current);
  fs.mkdirSync(path.dirname(tombstoneFile), { recursive: true });
  writeNote(tombstoneFile, { ...current.meta, scope: "user", deleted: true, updated_at: new Date().toISOString() }, "");
  writeJson({ ok: true, note: decorateNote({ ...current, file: tombstoneFile, layer: "user", meta: { ...current.meta, deleted: "true" } }, visible, { includeBody: false, includePaths }), deleted: true });
}

function listTags() {
  const counts = new Map();
  for (const note of visibleNotes()) {
    for (const tag of note.meta.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  writeJson([...counts.entries()].map(([tag, notes]) => ({ tag, notes })).sort((a, b) => b.notes - a.notes || a.tag.localeCompare(b.tag)));
}

function searchNotes() {
  const includePaths = takeFlag(args, "--paths");
  const scope = takeOption(args, "--scope", "all");
  const limit = Number(takeOption(args, "--limit", "10"));
  const query = takeOption(args, "--query", "") || args.join(" ");
  if (!query) usage();
  const needle = query.toLowerCase();
  const visible = visibleNotes(scope);
  writeJson(visible
    .map((note) => ({ ...decorateNote(note, visible, { includeBody: false, includePaths }), score: countMatches(`${note.meta.title}\n${note.body}`, needle), excerpt: excerpt(`${note.meta.title}\n${note.body}`, needle) }))
    .filter((note) => note.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit));
}

function showLinks() {
  const visible = visibleNotes();
  const note = findVisible(args[0] || takeOption(args, "--id"), visible);
  writeJson({ note: noteRef(note), links: resolveOutgoingLinks(note, visible) });
}

function showBacklinks() {
  const visible = visibleNotes();
  const note = findVisible(args[0] || takeOption(args, "--id"), visible);
  writeJson({ note: noteRef(note), ...backlinkReport(note, visible) });
}

function showStatus() {
  const includePaths = takeFlag(args, "--paths");
  const visible = visibleNotes();
  const tombstones = allNotes().filter((note) => note.layer === "user" && isDeleted(note)).map((note) => ({ ...noteRef({ ...note, status: "deleted" }), tags: note.meta.tags || [], aliases: note.meta.aliases || [], ...(includePaths ? pathInfo(note) : {}) }));
  writeJson([...visible.map((note) => decorateNote(note, visible, { includeBody: false, includePaths })), ...tombstones].sort((a, b) => a.title.localeCompare(b.title)));
}

function workonNote() {
  const includePaths = takeFlag(args, "--paths");
  const note = findVisible(args[0] || takeOption(args, "--id"), visibleNotes());
  const editable = ensureUserOverlay(note);
  const visible = visibleNotes();
  writeJson({ ok: true, note: decorateNote(findVisible(editable.meta.id, visible), visible, { includeBody: false, includePaths }) });
}

function promoteNote() {
  const includePaths = takeFlag(args, "--paths");
  const id = args[0] || takeOption(args, "--id");
  const all = allNotes();
  const user = findInLayer(id, "user", all);
  if (!user) throw new Error(`No user overlay note found: ${id}`);
  const project = all.find((note) => note.layer === "project" && note.meta.id === user.meta.id);
  if (isDeleted(user)) {
    if (project) fs.rmSync(project.file, { force: true });
    fs.rmSync(user.file, { force: true });
    writeJson({ ok: true, id: user.meta.id, promoted: "delete" });
    return;
  }
  const target = project?.file || projectFileFor(user);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  writeNote(target, { ...user.meta, scope: "project", deleted: undefined }, user.body);
  fs.rmSync(user.file, { force: true });
  const visible = visibleNotes();
  writeJson({ ok: true, promoted: true, note: decorateNote(findVisible(user.meta.id, visible), visible, { includeBody: false, includePaths }) });
}

function discardNote() {
  const id = args[0] || takeOption(args, "--id");
  const user = findInLayer(id, "user", allNotes());
  if (!user) throw new Error(`No user overlay note found: ${id}`);
  fs.rmSync(user.file, { force: true });
  writeJson({ ok: true, id: user.meta.id, discarded: true });
}

function indexSearch(searchCommand) {
  const scope = takeOption(args, "--scope", "all");
  const db = takeOption(args, "--db", "");
  const limit = takeOption(args, "--limit", "10");
  const query = takeOption(args, "--query", "") || args.join(" ");
  if (!query) usage();
  reindex({ scope, db });
  const child = runIndex([searchCommand, query, "--limit", limit, ...(db ? ["--db", db] : [])]);
  process.stdout.write(child.stdout);
}

function reindexNotes() {
  const scope = takeOption(args, "--scope", "all");
  const db = takeOption(args, "--db", "");
  writeJson(reindex({ scope, db }));
}

function rememberState() {
  const file = takeOption(args, "--file", "");
  const title = takeOption(args, "--title", "");
  const tags = takeOption(args, "--tags", "session,summary");
  const author = takeOption(args, "--author", "agent");
  const raw = file ? fs.readFileSync(file, "utf8") : readStdinIfAny();
  const state = JSON.parse(raw);
  const event = lastTextEvent(state);
  if (!event) throw new Error("No text event found in state");
  const noteTitle = title || event.text.split(/\r?\n/)[0].slice(0, 80);
  const id = `zk_${crypto.randomUUID()}`;
  const out = path.join(zettelDir("user"), `${slug(noteTitle)}-${id.slice(3, 11)}.md`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const now = new Date().toISOString();
  writeNote(out, { id, title: noteTitle, tags: parseList(tags), aliases: [], author, scope: "user", created_at: now, updated_at: now }, event.text || "");
  const visible = visibleNotes();
  writeJson({ ok: true, note: decorateNote(findVisible(id, visible), visible, { includeBody: false }) });
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
    links: () => invokeSelf(["links", req.id]),
    backlinks: () => invokeSelf(["backlinks", req.id]),
    status: () => invokeSelf(["status"]),
    workon: () => invokeSelf(["workon", req.id]),
    promote: () => invokeSelf(["promote", req.id]),
    discard: () => invokeSelf(["discard", req.id]),
    search_hybrid: () => invokeSelf(["search-hybrid", req.query, "--scope", req.scope || "all", "--limit", String(req.limit || 10), ...(req.db ? ["--db", req.db] : [])]),
    reindex: () => invokeSelf(["reindex", "--scope", req.scope || "all", ...(req.db ? ["--db", req.db] : [])]),
  };
  if (!map[action]) throw new Error(`Unknown zk action: ${action}`);
  process.stdout.write(map[action]());
}

function reindex({ scope, db }) {
  const dbPath = db || defaultDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${dbPath}${suffix}`, { force: true });
  const notes = visibleNotes(scope);
  for (const note of notes) {
    runIndex(["create", "--id", note.meta.id, "--title", note.meta.title, "--body", note.body, "--tags", JSON.stringify(note.meta.tags || []), "--aliases", JSON.stringify(note.meta.aliases || []), "--author", note.meta.author || "agent", "--db", dbPath]);
  }
  return { ok: true, reindexed: notes.length, db: dbPath };
}

function allNotes() {
  return ["project", "user"].flatMap((layer) => markdownFiles(zettelDir(layer)).map((file) => enrich({ file, layer, ...parseNote(fs.readFileSync(file, "utf8")) }))).filter((note) => note.meta.id);
}

function visibleNotes(scope = "all") {
  const notes = allNotes();
  const byId = new Map();
  for (const note of notes.filter((item) => item.layer === "project")) byId.set(note.meta.id, note);
  for (const note of notes.filter((item) => item.layer === "user")) {
    const project = byId.get(note.meta.id);
    if (isDeleted(note)) byId.delete(note.meta.id);
    else byId.set(note.meta.id, { ...note, projectFile: project?.file, projectText: project?.raw });
  }
  return [...byId.values()].filter((note) => scope === "all" || note.layer === scope).map((note) => enrich(note));
}

function enrich(note) {
  const project = note.layer === "user" ? allProjectByIdCache().get(note.meta.id) : undefined;
  const projectText = note.projectText ?? project?.raw;
  const projectFile = note.projectFile ?? project?.file;
  const status = isDeleted(note) ? "deleted" : note.layer === "project" ? "project" : projectText ? (projectText === note.raw ? "working" : "modified") : "new";
  return { ...note, projectFile, projectText, status };
}

function allProjectByIdCache() {
  if (!projectByIdCache) projectByIdCache = new Map(markdownFiles(zettelDir("project")).map((file) => {
    const parsed = parseNote(fs.readFileSync(file, "utf8"));
    return [parsed.meta.id, { file, layer: "project", raw: fs.readFileSync(file, "utf8"), ...parsed }];
  }).filter(([id]) => id));
  return projectByIdCache;
}

function findVisible(id, visible = visibleNotes()) {
  return findOne(id, visible, "visible note");
}

function findInLayer(id, layer, notes = allNotes()) {
  const matches = matchNotes(id, notes.filter((note) => note.layer === layer));
  if (matches.length === 0) return undefined;
  if (matches.length > 1) throw new Error(`Ambiguous ${layer} note: ${id}`);
  return matches[0];
}

function findOne(id, notes, label) {
  if (!id) usage();
  const matches = matchNotes(id, notes);
  if (matches.length === 0) throw new Error(`${label} not found: ${id}`);
  if (matches.length > 1) throw new Error(`Ambiguous ${label}: ${id}`);
  return matches[0];
}

function matchNotes(id, notes) {
  const needle = String(id || "").trim();
  const lower = needle.toLowerCase();
  const slugged = slug(needle);
  return notes.filter((note) => note.meta.id === needle
    || note.meta.title === needle
    || String(note.meta.title || "").toLowerCase() === lower
    || slug(note.meta.title) === slugged
    || path.basename(note.file) === needle
    || path.basename(note.file, ".md") === needle
    || (note.meta.aliases || []).some((alias) => alias === needle || String(alias).toLowerCase() === lower || slug(alias) === slugged));
}

function ensureUserOverlay(note) {
  if (note.layer === "user") return note;
  const target = userFileFor(note);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(note.file, target);
  projectByIdCache = undefined;
  return { ...note, file: target, layer: "user", status: "working" };
}

function decorateNote(note, visible, { includeBody, includePaths = false } = {}) {
  const links = resolveOutgoingLinks(note, visible);
  const backlinks = backlinkReport(note, visible);
  const result = {
    ...noteRef(note),
    tags: note.meta.tags || [],
    aliases: note.meta.aliases || [],
    author: note.meta.author,
    created_at: note.meta.created_at,
    updated_at: note.meta.updated_at,
    excerpt: note.body.trim().slice(0, 160),
    link_counts: {
      links: links.filter((link) => link.status === "resolved").length,
      backlinks: backlinks.backlinks.length,
      ambiguous_links: links.filter((link) => link.status === "ambiguous").length,
      unresolved_links: links.filter((link) => link.status === "unresolved").length,
      ambiguous_backlinks: backlinks.ambiguous_mentions.length,
    },
    links,
  };
  if (includeBody) result.body = note.body;
  if (includePaths) Object.assign(result, pathInfo(note));
  return result;
}

function noteRef(note) {
  return { id: note.meta.id, title: note.meta.title, file: path.basename(note.file), layer: note.layer, status: note.status };
}

function pathInfo(note) {
  return { path: note.file, project_path: note.projectFile };
}

function parseWikilinks(body) {
  const links = [];
  const pattern = /\[\[([^\]\n]+)\]\]/g;
  let match;
  while ((match = pattern.exec(body)) !== null) {
    const raw = match[1].trim();
    const [targetRaw, displayRaw] = raw.split("|");
    links.push({ raw: match[0], target: targetRaw.trim(), display: (displayRaw || targetRaw).trim(), index: match.index, context: excerptAt(body, match.index, match[0].length) });
  }
  return links;
}

function resolveOutgoingLinks(note, visible) {
  return parseWikilinks(note.body).map((link) => {
    const candidates = resolveLinkTarget(link.target, visible).filter((candidate) => candidate.meta.id !== note.meta.id);
    if (candidates.length === 0) return { ...link, status: "unresolved", suggestions: [] };
    if (candidates.length === 1) return { ...link, status: "resolved", note: noteRef(candidates[0]) };
    return { ...link, status: "ambiguous", candidates: candidates.map(noteRef), suggestions: candidates.map((candidate) => `[[${candidate.meta.id}|${link.display}]]`) };
  });
}

function backlinkReport(target, visible) {
  const backlinks = [];
  const ambiguous_mentions = [];
  for (const source of visible) {
    if (source.meta.id === target.meta.id) continue;
    for (const link of resolveOutgoingLinks(source, visible)) {
      if (link.status === "resolved" && link.note.id === target.meta.id) backlinks.push({ source: noteRef(source), link });
      if (link.status === "ambiguous" && link.candidates.some((candidate) => candidate.id === target.meta.id)) ambiguous_mentions.push({ source: noteRef(source), link });
    }
  }
  return { backlinks, ambiguous_mentions };
}

function resolveLinkTarget(target, visible) {
  const exactId = visible.filter((note) => note.meta.id === target);
  if (exactId.length) return exactId;
  const exactTitle = visible.filter((note) => note.meta.title === target);
  if (exactTitle.length) return exactTitle;
  const lower = target.toLowerCase();
  const caseTitle = visible.filter((note) => String(note.meta.title || "").toLowerCase() === lower);
  if (caseTitle.length) return caseTitle;
  const slugged = slug(target);
  const slugTitle = visible.filter((note) => slug(note.meta.title) === slugged);
  if (slugTitle.length) return slugTitle;
  return visible.filter((note) => (note.meta.aliases || []).some((alias) => alias === target || String(alias).toLowerCase() === lower || slug(alias) === slugged));
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

function userFileFor(note) {
  return path.join(zettelDir("user"), path.basename(note.file));
}

function projectFileFor(note) {
  return path.join(zettelDir("project"), path.basename(note.file));
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
  const cleanMeta = Object.fromEntries(Object.entries(meta).filter(([, value]) => value !== undefined));
  fs.writeFileSync(file, `---\n${formatFrontmatter(cleanMeta)}---\n\n${body.trim()}\n`);
  projectByIdCache = undefined;
}

function parseNote(text) {
  if (!text.startsWith("---\n")) return { meta: {}, body: text, raw: text };
  const end = text.indexOf("\n---", 4);
  if (end === -1) return { meta: {}, body: text, raw: text };
  return { meta: parseFrontmatter(text.slice(4, end)), body: text.slice(end + 4).trimStart(), raw: text };
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

function takeFlag(values, name) {
  const index = values.indexOf(name);
  if (index === -1) return false;
  values.splice(index, 1);
  return true;
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

function excerptAt(text, index, length) {
  return text.slice(Math.max(0, index - 60), index + length + 100).replace(/\s+/g, " ").trim();
}

function isDeleted(note) {
  return note.meta.deleted === true || note.meta.deleted === "true";
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
