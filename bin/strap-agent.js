#!/usr/bin/env node
import { appendEvent, normalizeState, readState, writeState } from "../src/state.js";

const [command, parentPath, childPathOrFlag, ...rest] = process.argv.slice(2);

function option(name, fallback = "") {
  const index = rest.indexOf(name);
  return index === -1 ? fallback : rest[index + 1] || fallback;
}

function usage() {
  console.error("Usage: strap-agent fork <parent.json> <child.json> --prompt <text> | strap-agent fold <parent.json> --child <child.json> --summary <text>");
  process.exit(2);
}

if (!command || !parentPath) usage();

if (command === "fork") {
  const childPath = childPathOrFlag;
  const prompt = option("--prompt", rest.join(" "));
  if (!childPath) usage();
  const child = normalizeState(await readState(parentPath));
  child.parent = { state_path: parentPath, fork_prompt: prompt, created_at: new Date().toISOString() };
  appendEvent(child, { from: "harness", to: ["assistant"], kind: "fork", text: prompt });
  await writeState(childPath, child);
} else if (command === "fold") {
  const childIndex = [childPathOrFlag, ...rest].indexOf("--child");
  const all = [childPathOrFlag, ...rest];
  const childPath = childIndex === -1 ? "" : all[childIndex + 1];
  const summaryIndex = all.indexOf("--summary");
  const summary = summaryIndex === -1 ? "" : all[summaryIndex + 1];
  if (!childPath || !summary) usage();
  const parent = normalizeState(await readState(parentPath));
  const child = normalizeState(await readState(childPath));
  appendEvent(parent, { from: "harness", to: ["assistant", "user"], kind: "agent_fold", text: summary, hidden: { child_state: child } });
  await writeState(parentPath, parent);
} else {
  usage();
}
