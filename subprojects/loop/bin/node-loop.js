#!/usr/bin/env node
import { appendEvent, normalizeState } from "#strap/core/state";
import { readJsonInput, takeOption, writeJson } from "#strap/core/cli-io";
import { loadModelConfig } from "#strap/providers/config";
import { completeProvider } from "#strap/providers/call";
import { getTools, toolMap } from "#strap/tools/registry";
import { debugToolCall, debugToolResult } from "#strap/core/debug";

const args = process.argv.slice(2);

function usage() {
  console.error("Usage: strap loop [--model current|name|path.json] [--tools all|fs|process|web|agent|scripts|none] [--max-turns 8] < state.json > next.json");
  process.exit(2);
}

const modelName = takeOption(args, "--model", "current");
const toolsName = takeOption(args, "--tools", "all");
const maxTurns = Number(takeOption(args, "--max-turns", "8"));
const finalize = takeOption(args, "--finalize", "true") !== "false";

const provider = await loadModelConfig(modelName);
const tools = toolsName === "none" ? [] : getTools(toolsName);
const toolsByName = toolsName === "none" ? new Map() : toolMap(toolsName);
const state = normalizeState(await readJsonInput(takeOption(args, "--file", "-")));

let turns = 0;
let final = false;
while (turns < maxTurns) {
  turns += 1;
  await completeProvider(state, provider, tools);
  const event = state.root.children.at(-1);
  const calls = event?.calls || [];
  if (!calls.length) {
    final = true;
    break;
  }
  for (const call of calls) await executeCall(call, toolsByName);
}

if (!final && finalize) {
  appendEvent(state, {
    from: "harness",
    to: ["assistant"],
    kind: "tool_budget_exhausted",
    text: `Tool budget exhausted after ${maxTurns} turn(s). Answer now using the gathered context. Do not request more tools.`,
  });
  await completeProvider(state, provider, []);
}

writeJson(state);

async function executeCall(call, toolsByName) {
  if (call.ok !== undefined) return;
  debugToolCall(call);
  const tool = toolsByName.get(call.tool);
  if (!tool) {
    call.ok = false;
    call.error = `Unknown tool: ${call.tool}`;
    debugToolResult(call);
    return;
  }
  try {
    call.output = await tool.execute(call.input || {});
    call.ok = true;
  } catch (error) {
    call.ok = false;
    call.error = error.message;
  }
  debugToolResult(call);
}
