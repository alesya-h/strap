#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { strapWorkRoot } from "#strap/core/paths";

const [command = "status", ...args] = process.argv.slice(2);

function usage() {
  console.error("Usage: strap history <init|root|status|log|diff|snapshot|new|restore> [args]");
  process.exit(2);
}

function work() {
  const root = strapWorkRoot();
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function ensureIgnore(root) {
  const file = path.join(root, ".gitignore");
  const wanted = ["/cache/", "/logs/", "/zettel/*.sqlite", "/zettel/*.sqlite-*", "/auth/", ""].join("\n");
  if (!fs.existsSync(file)) fs.writeFileSync(file, wanted);
}

function runJj(root, jjArgs, opts = {}) {
  const child = spawnSync("jj", jjArgs, { cwd: root, stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "inherit", encoding: "utf8" });
  if (child.error?.code === "ENOENT") throw new Error("jj is required for strap history");
  if (child.status !== 0) throw new Error(opts.capture ? (child.stderr || child.stdout) : `jj exited ${child.status}`);
  return child.stdout;
}

if (command === "init") {
  const root = work();
  ensureIgnore(root);
  if (!fs.existsSync(path.join(root, ".jj"))) runJj(root, ["git", "init", "--no-colocate", "."], { capture: true });
  process.stdout.write(`${JSON.stringify({ ok: true, work: root, jj: path.join(root, ".jj") }, null, 2)}\n`);
} else if (command === "root") {
  process.stdout.write(`${work()}\n`);
} else if (["status", "st"].includes(command)) {
  runJj(work(), ["status", ...args]);
} else if (command === "log") {
  runJj(work(), ["log", ...args]);
} else if (command === "diff") {
  runJj(work(), ["diff", ...args]);
} else if (command === "snapshot") {
  const root = work();
  if (!fs.existsSync(path.join(root, ".jj"))) throw new Error("History is not initialized. Run `strap history init`.");
  const message = takeOption(args, "--message") || takeOption(args, "-m") || args.join(" ") || "strap state snapshot";
  runJj(root, ["describe", "-m", message], { capture: true });
  runJj(root, ["new"], { capture: true });
  process.stdout.write(`${JSON.stringify({ ok: true, work: root, message }, null, 2)}\n`);
} else if (command === "new") {
  const rev = args[0];
  runJj(work(), rev ? ["new", rev] : ["new"]);
} else if (command === "restore") {
  const rev = args[0];
  if (!rev) usage();
  runJj(work(), ["restore", "--from", rev]);
} else {
  usage();
}

function takeOption(values, name) {
  const index = values.indexOf(name);
  if (index === -1) return undefined;
  const value = values[index + 1];
  values.splice(index, 2);
  return value;
}
