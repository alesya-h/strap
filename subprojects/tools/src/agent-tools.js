import fs from "node:fs/promises";
import { appendEvent, collapseLastOpenScope, createState, normalizeState, readState, writeState } from "#strap/core/state";
import { toolResult } from "#strap/core/result";
import { objectSchema, optionalString, requireString, stringSchema } from "#strap/core/schemas";

async function forkAgent(args) {
  const input = requireString(args, "state_path");
  const output = requireString(args, "child_state_path");
  const prompt = optionalString(args, "prompt", "");
  const parent = normalizeState(await readState(input));
  const child = structuredClone(parent);
  child.parent = { state_path: input, fork_prompt: prompt, created_at: new Date().toISOString() };
  appendEvent(child, { from: "harness", to: ["assistant"], kind: "fork", text: prompt });
  await writeState(output, child);
  return toolResult({ child_state_path: output });
}

async function foldAgent(args) {
  const parentPath = requireString(args, "state_path");
  const childPath = requireString(args, "child_state_path");
  const summary = requireString(args, "summary");
  const parent = normalizeState(await readState(parentPath));
  const child = normalizeState(await readState(childPath));
  appendEvent(parent, {
    from: "harness",
    to: ["assistant", "user"],
    kind: "agent_fold",
    text: summary,
    hidden: { child_state: child },
  });
  await writeState(parentPath, parent);
  return toolResult({ state_path: parentPath, folded_child_state_path: childPath });
}

async function contextPush(args) {
  const statePath = requireString(args, "state_path");
  const label = requireString(args, "label");
  const state = normalizeState(await readState(statePath));
  state.root.children.push({ type: "scope", label, status: "open", participants: ["assistant", "harness"], children: [] });
  await writeState(statePath, state);
  return toolResult({ state_path: statePath, label });
}

async function contextPop(args) {
  const statePath = requireString(args, "state_path");
  const summary = requireString(args, "summary");
  const state = normalizeState(await readState(statePath));
  collapseLastOpenScope(state, summary);
  await writeState(statePath, state);
  return toolResult({ state_path: statePath, summary });
}

async function initState(args) {
  const statePath = requireString(args, "state_path");
  await fs.writeFile(statePath, `${JSON.stringify(createState(), null, 2)}\n`);
  return toolResult({ state_path: statePath });
}

export function agentTools() {
  return [
    {
      name: "agent_fork",
      description: "Fork a child state file for tangential or delegated work. The child can later be folded back with a visible summary and hidden retained state.",
      inputSchema: objectSchema({
        state_path: stringSchema("Parent state JSON path"),
        child_state_path: stringSchema("Output child state JSON path"),
        prompt: stringSchema("Task or branch prompt for the child"),
      }, ["state_path", "child_state_path"]),
      readOnly: false,
      execute: forkAgent,
    },
    {
      name: "agent_fold",
      description: "Fold a child state back into its parent as a visible summary plus hidden retained child state.",
      inputSchema: objectSchema({
        state_path: stringSchema("Parent state JSON path to update"),
        child_state_path: stringSchema("Child state JSON path to fold"),
        summary: stringSchema("Visible summary of the child work"),
      }, ["state_path", "child_state_path", "summary"]),
      readOnly: false,
      execute: foldAgent,
    },
    {
      name: "context_push",
      description: "Open a compactable scope in a state file for exploratory work.",
      inputSchema: objectSchema({ state_path: stringSchema("State JSON path"), label: stringSchema("Scope label") }, ["state_path", "label"]),
      readOnly: false,
      execute: contextPush,
    },
    {
      name: "context_pop",
      description: "Collapse the most recent open scope into a visible summary while retaining the full subtree as hidden state.",
      inputSchema: objectSchema({ state_path: stringSchema("State JSON path"), summary: stringSchema("Visible scope summary") }, ["state_path", "summary"]),
      readOnly: false,
      execute: contextPop,
    },
    {
      name: "state_init",
      description: "Create an empty strap v0.2 actor/event/scope state file.",
      inputSchema: objectSchema({ state_path: stringSchema("State JSON path to create") }, ["state_path"]),
      readOnly: false,
      execute: initState,
    },
  ];
}
