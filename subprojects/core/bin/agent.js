#!/usr/bin/env node
import { appendEvent, normalizeState } from "../../../src/state.js";
import { readJsonInput, takeOption, writeJson } from "../../../src/cli-io.js";
import fs from "node:fs/promises";

const [command, ...args] = process.argv.slice(2);

function usage() {
  console.error("Usage: strap agent fork --prompt <text> < parent.json > child.json | strap agent fold --child child.json --summary <text> < parent.json > parent-next.json");
  process.exit(2);
}

if (!command) usage();

if (command === "fork") {
  const prompt = takeOption(args, "--prompt", args.join(" "));
  const child = normalizeState(await readJsonInput(takeOption(args, "--file", "-")));
  child.parent = { fork_prompt: prompt, created_at: new Date().toISOString() };
  appendEvent(child, { from: "harness", to: ["assistant"], kind: "fork", text: prompt });
  writeJson(child);
} else if (command === "fold") {
  const childPath = takeOption(args, "--child", "");
  const summary = takeOption(args, "--summary", "");
  if (!childPath || !summary) usage();
  const parent = normalizeState(await readJsonInput(takeOption(args, "--file", "-")));
  const child = normalizeState(JSON.parse(await fs.readFile(childPath, "utf8")));
  appendEvent(parent, { from: "harness", to: ["assistant", "user"], kind: "agent_fold", text: summary, hidden: { child_state: child } });
  writeJson(parent);
} else {
  usage();
}
