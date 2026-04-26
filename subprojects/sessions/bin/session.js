#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createState, appendEvent, normalizeState } from "#strap/core/state";
import { readJsonInput, writeJson } from "#strap/core/cli-io";
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
  if (!fs.existsSync(currentFile())) throw new Error("No current session. Run `strap session new <name>`.");
  return fs.readFileSync(currentFile(), "utf8").trim();
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

function usage() {
  console.error("Usage: strap session <new|list|path|state|show|ask|save|trace> [args]");
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
  setCurrent(dir);
  recordTrace(dir, { kind: "session_new", title });
  process.stdout.write(`${JSON.stringify({ ok: true, dir, state: statePath(dir) }, null, 2)}\n`);
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
  writeJson(state);
} else if (command === "save") {
  const dir = currentDir();
  const state = normalizeState(await readJsonInput("-"));
  fs.writeFileSync(statePath(dir), `${JSON.stringify(state, null, 2)}\n`);
  recordTrace(dir, { kind: "session_save" });
  writeJson({ ok: true, state: statePath(dir) });
} else {
  usage();
}
