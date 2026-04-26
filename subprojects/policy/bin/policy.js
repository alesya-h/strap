#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { strapConfigRoot } from "#strap/core/paths";

const [command, name] = process.argv.slice(2);
const dir = path.join(strapConfigRoot(), "policies");

function policies() {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => ({ name: path.basename(file, ".json"), path: path.join(dir, file) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

if (command === "list") {
  process.stdout.write(`${JSON.stringify(policies(), null, 2)}\n`);
} else if (command === "show") {
  if (!name) throw new Error("Usage: strap policy show <name>");
  const file = path.join(dir, `${name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Policy not found: ${name}`);
  process.stdout.write(fs.readFileSync(file, "utf8"));
} else {
  console.error("Usage: strap policy <list|show> [name]");
  process.exit(2);
}
