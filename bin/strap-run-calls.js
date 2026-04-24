#!/usr/bin/env node
import { toolMap } from "../src/registry.js";
import { flattenVisible, normalizeState, readState, writeState } from "../src/state.js";

const [statePath, group = "all"] = process.argv.slice(2);
if (!statePath) {
  console.error("Usage: strap-run-calls <state.json> [tool-group]");
  process.exit(2);
}

const state = normalizeState(await readState(statePath));
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

await writeState(statePath, state);
console.error(`executed ${executed} call(s)`);
