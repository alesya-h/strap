#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { strapWorkRoot } from "#strap/core/paths";

const [command = "init"] = process.argv.slice(2);
const dirs = ["commands", "sessions", "tools", "porcelain", "zettel", "logs", "cache", "branches", "config"];

if (command === "init") {
  const work = strapWorkRoot();
  fs.mkdirSync(work, { recursive: true });
  for (const dir of dirs) fs.mkdirSync(path.join(work, dir), { recursive: true });
  const readme = path.join(work, "README.md");
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(readme, `# Strap Work\n\nProject-local mutable harness state.\n\n- commands/\n- sessions/\n- tools/\n- porcelain/\n- zettel/\n- logs/\n- cache/\n- branches/\n- config/\n`);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, work, dirs }, null, 2)}\n`);
} else if (command === "path") {
  process.stdout.write(`${strapWorkRoot()}\n`);
} else {
  console.error("Usage: strap work <init|path>");
  process.exit(2);
}
