#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { strapCommandDirs, strapConfigRoot, strapRoot, strapWorkRoot } from "#strap/core/paths";

const [command, ...args] = process.argv.slice(2);

function commandItems() {
  const found = new Map();
  for (const root of [...strapCommandDirs()].reverse()) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(root, entry.name);
      if (!fs.existsSync(path.join(dir, "run"))) continue;
      found.set(entry.name, {
        name: entry.name,
        dir,
        hidden: fs.existsSync(path.join(dir, "hide")),
        description: readDescription(dir),
      });
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
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
  console.error("Usage: strap commands <list|new|roots> [args]");
  process.exit(2);
}

if (command === "list") {
  const json = parseFlag("--json");
  const all = parseFlag("--all");
  const items = commandItems().filter((item) => all || !item.hidden);
  if (json) process.stdout.write(`${JSON.stringify(items, null, 2)}\n`);
  else for (const item of items) process.stdout.write(`${item.name}\t${item.description}\n`);
} else if (command === "roots") {
  process.stdout.write(`${JSON.stringify({ root: strapRoot(), config: strapConfigRoot(), work: strapWorkRoot(), command_dirs: strapCommandDirs() }, null, 2)}\n`);
} else if (command === "new") {
  const name = args[0];
  if (!validName(name)) throw new Error("Command name must match [a-z][a-z0-9-]*");
  const dir = path.join(strapWorkRoot(), "commands", name);
  if (fs.existsSync(dir)) throw new Error(`Command already exists: ${dir}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "run"), `#!/usr/bin/env bash\nset -euo pipefail\n\necho "${name}: implement me"\n`);
  fs.chmodSync(path.join(dir, "run"), 0o755);
  fs.writeFileSync(path.join(dir, "desc"), `${name} command.\n\nUsage:\n  strap ${name}\n`);
  fs.mkdirSync(path.join(dir, "inner"));
  process.stdout.write(`${JSON.stringify({ ok: true, name, dir }, null, 2)}\n`);
} else {
  usage();
}
