import fs from "node:fs";
import path from "node:path";
import { strapGlobalRoot, strapProjectRoot, strapRoot, strapSessionRoot, strapWorkRoot } from "./env.js";

function maybeJoin(root, name) {
  return root ? [path.join(root, name)] : [];
}

export function strapCommandDirs() {
  const configured = (process.env.STRAP_COMMAND_PATH || "").split(path.delimiter).filter(Boolean);
  const session = strapSessionRoot();
  return [
    ...configured,
    ...maybeJoin(session ? path.join(session, "overlay") : undefined, "commands"),
    path.join(strapWorkRoot(), "commands"),
    path.join(strapProjectRoot(), "commands"),
    path.join(strapGlobalRoot(), "commands"),
    path.join(strapRoot(), "subprojects", "cli", "commands"),
  ];
}

export function commandDir(name) {
  for (const root of strapCommandDirs()) {
    const candidate = path.join(root, name);
    if (fs.existsSync(path.join(candidate, "run"))) return candidate;
  }
  return undefined;
}

export function commands() {
  const found = new Map();
  for (const root of [...strapCommandDirs()].reverse()) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(root, entry.name);
      if (!fs.existsSync(path.join(dir, "run"))) continue;
      found.set(entry.name, { name: entry.name, dir });
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function description(dir) {
  const file = path.join(dir, "desc");
  if (!fs.existsSync(file)) return "";
  return fs.readFileSync(file, "utf8").split(/\r?\n/)[0] || "";
}

export function prettyCommands(showHidden) {
  process.stdout.write("\n  Available commands:\n\n");
  for (const item of commands()) {
    if (!showHidden && fs.existsSync(path.join(item.dir, "hide"))) continue;
    const desc = description(item.dir);
    process.stdout.write(`  * ${item.name.padEnd(15)}${desc ? ` - ${desc}` : ""}\n`);
  }
  process.stdout.write("\nUse `strap help <command>` to see docs for a command.\n\n");
}
