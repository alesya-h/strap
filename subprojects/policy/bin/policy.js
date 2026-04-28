#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { strapConfigRoot } from "#strap/core/paths";
import { decide, loadPolicy } from "#strap/policy/authority";

const [command, name, ...args] = process.argv.slice(2);
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
} else if (command === "decide") {
  const options = parseOptions([name, ...args].filter(Boolean));
  const policy = loadPolicy(options.policy || process.env.STRAP_POLICY || "default");
  const { policy: _policyName, ...decisionOptions } = options;
  process.stdout.write(`${JSON.stringify(decide({ policy, ...decisionOptions }), null, 2)}\n`);
} else {
  console.error("Usage: strap policy <list|show|decide> [args]");
  process.exit(2);
}

function parseOptions(values) {
  const out = {};
  for (let i = 0; i < values.length; i += 1) {
    const key = values[i];
    if (!key?.startsWith("--")) continue;
    out[key.slice(2).replaceAll("-", "_")] = values[i + 1];
    i += 1;
  }
  if (out.action === undefined) out.action = "execute";
  return { ...out, path: out.path };
}
