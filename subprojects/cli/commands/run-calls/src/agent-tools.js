import fs from "node:fs/promises";
import { appendEvent, collapseLastOpenScope, createState, readState, writeState } from "./state.js";
import { toolResult } from "./result.js";

async function forkAgent(args) {
  const parent = await readState(String(args.state_path));
  const child = structuredClone(parent);
  child.parent = { state_path: args.state_path, fork_prompt: args.prompt || "", created_at: new Date().toISOString() };
  appendEvent(child, { from: "harness", to: ["assistant"], kind: "fork", text: args.prompt || "" });
  await writeState(String(args.child_state_path), child);
  return toolResult({ child_state_path: args.child_state_path });
}

async function foldAgent(args) {
  const parent = await readState(String(args.state_path));
  const child = await readState(String(args.child_state_path));
  appendEvent(parent, { from: "harness", to: ["assistant", "user"], kind: "agent_fold", text: String(args.summary || ""), hidden: { child_state: child } });
  await writeState(String(args.state_path), parent);
  return toolResult({ state_path: args.state_path, folded_child_state_path: args.child_state_path });
}

async function contextPush(args) {
  const state = await readState(String(args.state_path));
  state.root.children.push({ type: "scope", label: String(args.label || "scope"), status: "open", participants: ["assistant", "harness"], children: [] });
  await writeState(String(args.state_path), state);
  return toolResult({ state_path: args.state_path, label: args.label });
}

async function contextPop(args) {
  const state = collapseLastOpenScope(await readState(String(args.state_path)), String(args.summary || ""));
  await writeState(String(args.state_path), state);
  return toolResult({ state_path: args.state_path, summary: args.summary });
}

async function initState(args) {
  await fs.writeFile(String(args.state_path), `${JSON.stringify(createState(), null, 2)}\n`);
  return toolResult({ state_path: args.state_path });
}

export function agentTools() {
  return [
    { name: "agent_fork", execute: forkAgent },
    { name: "agent_fold", execute: foldAgent },
    { name: "context_push", execute: contextPush },
    { name: "context_pop", execute: contextPop },
    { name: "state_init", execute: initState },
  ];
}
