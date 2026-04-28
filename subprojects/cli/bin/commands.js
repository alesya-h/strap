#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { strapCommandDirs, strapConfigRoot, strapProjectRoot, strapRoot, strapWorkRoot } from "#strap/core/paths";

const [command, ...args] = process.argv.slice(2);

function commandItems() {
  const found = new Map();
  for (const root of [...strapCommandDirs()].reverse()) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(root, entry.name);
      if (!fs.existsSync(path.join(dir, "run"))) continue;
      const manifest = commandManifest(entry.name, dir);
      found.set(entry.name, {
        name: entry.name,
        dir,
        hidden: fs.existsSync(path.join(dir, "hide")),
        description: readDescription(dir),
        manifest,
      });
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function commandManifest(name, dir) {
  const file = path.join(dir, "command.json");
  const declared = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  return {
    name,
    description: readDescription(dir),
    readOnly: Boolean(declared.readOnly),
    destructive: Boolean(declared.destructive),
    openWorld: Boolean(declared.openWorld),
    hasSpec: fs.existsSync(path.join(dir, "spec.yaml")),
    hasDynamicCompletion: fs.existsSync(path.join(dir, "carapace-complete")) || fs.existsSync(path.join(dir, "compgen")),
    inner: fs.existsSync(path.join(dir, "inner")) ? fs.readdirSync(path.join(dir, "inner")).sort() : [],
    dir,
    ...declared,
  };
}

function validateCommand(item) {
  const errors = [];
  const warnings = [];
  if (!validName(item.name)) errors.push("name must match [a-z][a-z0-9-]*");
  const run = path.join(item.dir, "run");
  const desc = path.join(item.dir, "desc");
  if (!fs.existsSync(run)) errors.push("missing run");
  else if ((fs.statSync(run).mode & 0o111) === 0) errors.push("run is not executable");
  if (!fs.existsSync(desc)) errors.push("missing desc");
  else if (!readDescription(item.dir)) errors.push("desc first line is empty");
  const inner = path.join(item.dir, "inner");
  if (fs.existsSync(inner)) {
    for (const name of fs.readdirSync(inner)) {
      const file = path.join(inner, name);
      if (fs.statSync(file).isFile() && (fs.statSync(file).mode & 0o111) === 0) warnings.push(`inner/${name} is not executable`);
    }
  }
  return { name: item.name, dir: item.dir, ok: errors.length === 0, errors, warnings, manifest: item.manifest };
}

function readDescription(dir) {
  const desc = path.join(dir, "desc");
  if (!fs.existsSync(desc)) return "";
  return fs.readFileSync(desc, "utf8").split(/\r?\n/)[0] || "";
}

function parseFlag(name) {
  const index = args.indexOf(name);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

function validName(name) {
  return /^[a-z][a-z0-9-]*$/.test(name || "");
}

function usage() {
  console.error("Usage: strap commands <list|manifest|validate|new|roots> [args]");
  process.exit(2);
}

if (command === "list") {
  const json = parseFlag("--json");
  const all = parseFlag("--all");
  const items = commandItems().filter((item) => all || !item.hidden);
  if (json) process.stdout.write(`${JSON.stringify(items, null, 2)}\n`);
  else for (const item of items) process.stdout.write(`${item.name}\t${item.description}\n`);
} else if (command === "roots") {
  process.stdout.write(`${JSON.stringify({ root: strapRoot(), config: strapConfigRoot(), project: strapProjectRoot(), work: strapWorkRoot(), command_dirs: strapCommandDirs() }, null, 2)}\n`);
} else if (command === "manifest") {
  const name = args[0];
  const item = commandItems().find((item) => item.name === name);
  if (!item) throw new Error(`Command not found: ${name}`);
  process.stdout.write(`${JSON.stringify(item.manifest, null, 2)}\n`);
} else if (command === "validate") {
  const json = parseFlag("--json");
  const name = args[0];
  const items = name ? commandItems().filter((item) => item.name === name) : commandItems();
  if (name && items.length === 0) throw new Error(`Command not found: ${name}`);
  const results = items.map(validateCommand);
  if (json) process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  else for (const result of results) process.stdout.write(`${result.ok ? "ok" : "fail"}\t${result.name}\t${[...result.errors, ...result.warnings].join("; ")}\n`);
  if (results.some((result) => !result.ok)) process.exit(1);
} else if (command === "new") {
  const name = args[0];
  if (!validName(name)) throw new Error("Command name must match [a-z][a-z0-9-]*");
  const dir = path.join(strapWorkRoot(), "commands", name);
  if (fs.existsSync(dir)) throw new Error(`Command already exists: ${dir}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "run"), `#!/usr/bin/env bash\nset -euo pipefail\n\necho "${name}: implement me"\n`);
  fs.chmodSync(path.join(dir, "run"), 0o755);
  fs.writeFileSync(path.join(dir, "desc"), `${name} command.\n\nUsage:\n  strap ${name}\n`);
  fs.writeFileSync(path.join(dir, "command.json"), `${JSON.stringify({ name, readOnly: false, destructive: false, openWorld: false }, null, 2)}\n`);
  fs.mkdirSync(path.join(dir, "inner"));
  process.stdout.write(`${JSON.stringify({ ok: true, name, dir }, null, 2)}\n`);
} else {
  usage();
}
