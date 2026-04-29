#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { strapSessionRoot } from "#strap/core/paths";

const [command = "status", ...args] = process.argv.slice(2);

function usage() {
  console.error("Usage: strap history <init|root|status|log|diff|snapshot|new|restore|ui|jjui> [args]");
  process.exit(2);
}

function session() {
  const root = strapSessionRoot();
  if (!root) throw new Error("No current session. Run `strap session new <name>` first.");
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function ensureIgnore(root) {
  const file = path.join(root, ".gitignore");
  const wanted = ["/cache/", "/logs/", "/zettel/*.sqlite", "/zettel/*.sqlite-*", "/auth/", ""].join("\n");
  if (fs.existsSync(file)) return false;
  fs.writeFileSync(file, wanted);
  return true;
}

function runJj(root, jjArgs, opts = {}) {
  const child = spawnSync("jj", jjArgs, { cwd: root, stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "inherit", encoding: "utf8" });
  if (child.error?.code === "ENOENT") throw new Error("jj is required for strap history");
  if (child.status !== 0) throw new Error(opts.capture ? (child.stderr || child.stdout) : `jj exited ${child.status}`);
  return child.stdout;
}

if (command === "init") {
  const root = work();
  const changed = ensureIgnore(root);
  const initialized = !fs.existsSync(path.join(root, ".jj"));
  if (initialized) runJj(root, ["git", "init", "--no-colocate", "."], { capture: true });
  if (changed || initialized) {
    runJj(root, ["describe", "-m", "history init"], { capture: true });
    runJj(root, ["new"], { capture: true });
  }
  process.stdout.write(`${JSON.stringify({ ok: true, work: root, jj: path.join(root, ".jj") }, null, 2)}\n`);
} else if (command === "root") {
  process.stdout.write(`${session()}\n`);
} else if (["status", "st"].includes(command)) {
  runJj(session(), ["status", ...args]);
} else if (command === "log") {
  runJj(session(), ["log", ...args]);
} else if (command === "diff") {
  runJj(session(), ["diff", ...args]);
} else if (command === "snapshot") {
  const root = session();
  if (!fs.existsSync(path.join(root, ".jj"))) throw new Error("History is not initialized. Run `strap history init`.");
  const message = takeOption(args, "--message") || takeOption(args, "-m") || args.join(" ") || "strap state snapshot";
  runJj(root, ["describe", "-m", message], { capture: true });
  runJj(root, ["new"], { capture: true });
  process.stdout.write(`${JSON.stringify({ ok: true, work: root, message }, null, 2)}\n`);
} else if (command === "new") {
  const rev = args[0];
  runJj(session(), rev ? ["new", rev] : ["new"]);
} else if (command === "restore") {
  const rev = args[0];
  if (!rev) usage();
  runJj(session(), ["restore", "--from", rev]);
} else if (["ui", "jjui"].includes(command)) {
  runUi(session(), args);
} else {
  usage();
}

function work() {
  return session();
}

function runUi(root, uiArgs) {
  const child = spawnSync("jjui", uiArgs, { cwd: root, stdio: "inherit", encoding: "utf8" });
  if (child.error?.code === "ENOENT") throw new Error("jjui is required for `strap history ui`");
  if (child.status !== 0) throw new Error(`jjui exited ${child.status ?? child.signal}`);
}

function takeOption(values, name) {
  const index = values.indexOf(name);
  if (index === -1) return undefined;
  const value = values[index + 1];
  values.splice(index, 2);
  return value;
}
