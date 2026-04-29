#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createState, appendEvent, normalizeState } from "#strap/core/state";
import { readJsonInput, takeOption, writeJson } from "#strap/core/cli-io";
import { strapWorkRoot } from "#strap/core/paths";

const [command, ...args] = process.argv.slice(2);

function sessionsRoot() {
  const root = path.join(strapWorkRoot(), "sessions");
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function slug(text) {
  const cleaned = String(text || "session").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return cleaned || "session";
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function currentFile() {
  return path.join(sessionsRoot(), "current");
}

function setCurrent(dir) {
  fs.writeFileSync(currentFile(), `${dir}\n`);
}

function currentDir() {
  if (!process.env.STRAP_SESSION) throw new Error("No active session. Set STRAP_SESSION, run `strap session new <name>`, or use `strap with-session <session> -- <command>`.");
  return path.resolve(process.env.STRAP_SESSION);
}

function statePath(dir = currentDir()) {
  return path.join(dir, "state.json");
}

function tracePath(dir = currentDir()) {
  return path.join(dir, "trace.jsonl");
}

function recordTrace(dir, event) {
  fs.appendFileSync(tracePath(dir), `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
}

function runJj(dir, jjArgs, opts = {}) {
  const child = spawnSync("jj", jjArgs, { cwd: dir, stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "inherit", encoding: "utf8" });
  if (child.error?.code === "ENOENT") throw new Error("jj is required for strap session history");
  if (child.status !== 0) throw new Error(opts.capture ? (child.stderr || child.stdout) : `jj exited ${child.status}`);
  return child.stdout;
}

function ensureHistory(dir) {
  ensureIgnore(dir);
  if (!fs.existsSync(path.join(dir, ".jj"))) runJj(dir, ["git", "init", "--no-colocate", "."], { capture: true });
}

function ensureIgnore(dir) {
  const file = path.join(dir, ".gitignore");
  const wanted = ["/provider-requests/tmp/", "/tool-results/tmp/", ""].join("\n");
  if (!fs.existsSync(file)) fs.writeFileSync(file, wanted);
}

function snapshotHistory(dir, message) {
  ensureHistory(dir);
  runJj(dir, ["describe", "-m", message], { capture: true });
  runJj(dir, ["new"], { capture: true });
}

function usage() {
  console.error("Usage: strap session <new|copy|list|resolve|path|state|show|ask|save|trace> [args]");
  process.exit(2);
}

if (command === "new") {
  const title = args.join(" ") || "session";
  const dir = path.join(sessionsRoot(), `${stamp()}-${slug(title)}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "provider-requests"));
  fs.mkdirSync(path.join(dir, "tool-results"));
  fs.writeFileSync(path.join(dir, "meta.json"), `${JSON.stringify({ title, created_at: new Date().toISOString() }, null, 2)}\n`);
  fs.writeFileSync(statePath(dir), `${JSON.stringify(createState(), null, 2)}\n`);
  fs.writeFileSync(tracePath(dir), "");
  recordTrace(dir, { kind: "session_new", title });
  snapshotHistory(dir, `session new: ${title}`);
  setCurrent(dir);
  process.stdout.write(`${JSON.stringify({ ok: true, dir, state: statePath(dir) }, null, 2)}\n`);
} else if (command === "copy") {
  const source = currentDir();
  const at = takeOption(args, "--at", "");
  const title = args.join(" ") || `${readSessionTitle(source)} copy`;
  const dir = path.join(sessionsRoot(), `${stamp()}-${slug(title)}`);
  fs.cpSync(source, dir, { recursive: true, errorOnExist: true, filter: (file) => path.basename(file) !== ".jj" });
  const meta = readSessionMeta(dir);
  fs.writeFileSync(path.join(dir, "meta.json"), `${JSON.stringify({
    ...meta,
    title,
    created_at: new Date().toISOString(),
    copied_from: source,
    copied_at: at || undefined,
  }, null, 2)}\n`);
  if (at) {
    const state = normalizeState(JSON.parse(fs.readFileSync(statePath(dir), "utf8")));
    truncateStateAfterBookmark(state, at);
    fs.writeFileSync(statePath(dir), `${JSON.stringify(state, null, 2)}\n`);
  }
  recordTrace(dir, { kind: "session_copy", copied_from: source, title, at: at || undefined });
  snapshotHistory(dir, `session copy: ${title}`);
  setCurrent(dir);
  writeJson({ ok: true, dir, state: statePath(dir), copied_from: source, copied_at: at || undefined });
} else if (command === "list") {
  const items = fs.readdirSync(sessionsRoot(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = path.join(sessionsRoot(), entry.name);
      const metaFile = path.join(dir, "meta.json");
      const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : {};
      return { name: entry.name, dir, ...meta };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  writeJson(items);
} else if (command === "resolve") {
  const selector = args.join(" ");
  if (!selector && process.env.STRAP_SESSION) process.stdout.write(`${path.resolve(process.env.STRAP_SESSION)}\n`);
  else if (!selector) throw new Error("Usage: strap session resolve <name-or-path>");
  else process.stdout.write(`${resolveSession(selector)}\n`);
} else if (command === "path") {
  process.stdout.write(`${currentDir()}\n`);
} else if (command === "state") {
  process.stdout.write(`${statePath()}\n`);
} else if (command === "show") {
  process.stdout.write(fs.readFileSync(statePath(), "utf8"));
} else if (command === "trace") {
  process.stdout.write(fs.readFileSync(tracePath(), "utf8"));
} else if (command === "ask") {
  const dir = currentDir();
  const text = args.join(" ");
  if (!text) throw new Error("Usage: strap session ask <text>");
  const state = normalizeState(JSON.parse(fs.readFileSync(statePath(dir), "utf8")));
  appendEvent(state, { from: "user", to: ["assistant"], kind: "message", text });
  fs.writeFileSync(statePath(dir), `${JSON.stringify(state, null, 2)}\n`);
  recordTrace(dir, { kind: "session_ask", text });
  snapshotHistory(dir, "session ask");
  writeJson(state);
} else if (command === "save") {
  const dir = currentDir();
  const state = normalizeState(await readJsonInput("-"));
  fs.writeFileSync(statePath(dir), `${JSON.stringify(state, null, 2)}\n`);
  recordTrace(dir, { kind: "session_save" });
  snapshotHistory(dir, "session save");
  writeJson({ ok: true, state: statePath(dir) });
} else {
  usage();
}

function readSessionMeta(dir) {
  const file = path.join(dir, "meta.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

function readSessionTitle(dir) {
  return readSessionMeta(dir).title || path.basename(dir);
}

function resolveSession(selector) {
  const direct = path.resolve(selector);
  if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) return direct;
  const root = sessionsRoot();
  const exact = path.join(root, selector);
  if (fs.existsSync(exact) && fs.statSync(exact).isDirectory()) return exact;
  const matches = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.includes(selector))
    .map((entry) => path.join(root, entry.name));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`Ambiguous session: ${selector}`);
  throw new Error(`Session not found: ${selector}`);
}

function truncateStateAfterBookmark(state, bookmarkId) {
  if (!truncateScopeAfterBookmark(state.root, bookmarkId)) throw new Error(`Bookmark not found: ${bookmarkId}`);
}

function truncateScopeAfterBookmark(scope, bookmarkId) {
  const children = scope.children || [];
  for (let index = 0; index < children.length; index += 1) {
    const node = children[index];
    if (bookmarkIds(node).includes(bookmarkId)) {
      scope.children = children.slice(0, index + 1);
      return true;
    }
    if (node.type === "scope" && node.status !== "collapsed" && truncateScopeAfterBookmark(node, bookmarkId)) {
      scope.children = children.slice(0, index + 1);
      return true;
    }
  }
  return false;
}

function bookmarkIds(node) {
  return (node.bookmarks || []).map((bookmark) => typeof bookmark === "string" ? bookmark : bookmark?.id).filter(Boolean);
}
