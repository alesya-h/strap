#!/usr/bin/env node
import { toolMap } from "../../../src/registry.js";
import { flattenVisible, normalizeState } from "../../../src/state.js";
import { readJsonInput, takeOption, writeJson } from "../../../src/cli-io.js";

const args = process.argv.slice(2);
const group = takeOption(args, "--tools", args[0] || "all");

const state = normalizeState(await readJsonInput(takeOption(args, "--file", "-")));
const tools = toolMap(group);
let executed = 0;

for (const event of flattenVisible(state.root)) {
  for (const call of event.calls || []) {
    if (call.ok !== undefined) continue;
    const tool = tools.get(call.tool);
    if (!tool) {
      call.ok = false;
      call.error = `Unknown tool: ${call.tool}`;
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
    executed += 1;
  }
}

console.error(`executed ${executed} call(s)`);
writeJson(state);
