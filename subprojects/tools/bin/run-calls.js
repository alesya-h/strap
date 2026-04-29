#!/usr/bin/env node
import { toolMap } from "#strap/tools/registry";
import { flattenVisible, normalizeState } from "#strap/core/state";
import { readJsonInput, takeOption, writeJson } from "#strap/core/cli-io";
import { debugToolCall, debugToolResult } from "#strap/core/debug";

const args = process.argv.slice(2);
const group = takeOption(args, "--tools", args[0] || "all");

const state = normalizeState(await readJsonInput(takeOption(args, "--file", "-")));
const tools = toolMap(group);
let executed = 0;

for (const event of flattenVisible(state.root)) {
  for (const call of event.calls || []) {
    if (call.ok !== undefined) continue;
    debugToolCall(call);
    const tool = tools.get(call.tool);
    if (!tool) {
      call.ok = false;
      call.error = `Unknown tool: ${call.tool}`;
      debugToolResult(call);
      continue;
    }
    try {
      const result = await tool.execute(call.input || {});
      call.ok = true;
      call.output = result;
    } catch (error) {
      call.ok = false;
      call.error = error.message;
    }
    debugToolResult(call);
    executed += 1;
  }
}

console.error(`executed ${executed} call(s)`);
writeJson(state);
