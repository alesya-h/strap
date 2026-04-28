#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { writeJson } from "#strap/core/cli-io";
import { globalStatus } from "#strap/core/artifacts";
import { strapRoot } from "#strap/core/paths";

const args = process.argv.slice(2);

function takeFlag(name) {
  const index = args.indexOf(name);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

const includePaths = takeFlag("--paths");
const status = globalStatus({ includePaths });
status.artifacts.zettel = zettelStatus();
writeJson(status);

function zettelStatus() {
  const child = spawnSync(process.execPath, [path.join(strapRoot(), "subprojects", "zettel", "bin", "zk-md.js"), "status", ...(includePaths ? ["--paths"] : [])], { encoding: "utf8", env: process.env });
  if (child.status !== 0) return { error: child.stderr || child.stdout || `zk status exited ${child.status}` };
  return JSON.parse(child.stdout || "[]");
}
