#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { strapProjectRoot, strapWorkRoot } from "#strap/core/paths";

const [command = "init"] = process.argv.slice(2);
const projectDirs = ["commands", "tools", "porcelain", "zettel", "config", "policies"];
const workDirs = ["history", "sessions", "logs", "cache", "branches", "scratch", "commands", "tools", "porcelain", "zettel", "config"];

if (command === "init") {
  const project = strapProjectRoot();
  const work = strapWorkRoot();
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(work, { recursive: true });
  for (const dir of projectDirs) fs.mkdirSync(path.join(project, dir), { recursive: true });
  for (const dir of workDirs) fs.mkdirSync(path.join(work, dir), { recursive: true });
  const projectReadme = path.join(project, "README.md");
  if (!fs.existsSync(projectReadme)) {
    fs.writeFileSync(projectReadme, `# Strap Project\n\nProject-shared harness artifacts. This directory may be committed with the project.\n\n- commands/\n- tools/\n- porcelain/\n- zettel/\n- config/\n- policies/\n`);
  }
  const workReadme = path.join(work, "README.md");
  if (!fs.existsSync(workReadme)) {
    fs.writeFileSync(workReadme, `# Strap User Work\n\nUser/agent-local mutable harness state. This directory should be ignored by the project VCS.\n\n- history/\n- sessions/\n- logs/\n- cache/\n- branches/\n- scratch/\n- commands/\n- tools/\n- porcelain/\n- zettel/\n- config/\n`);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, project, work, project_dirs: projectDirs, work_dirs: workDirs }, null, 2)}\n`);
} else if (command === "path") {
  process.stdout.write(`${JSON.stringify({ project: strapProjectRoot(), work: strapWorkRoot() }, null, 2)}\n`);
} else {
  console.error("Usage: strap work <init|path>");
  process.exit(2);
}
