import { toolMap } from "./registry.js";
import { flattenVisible, normalizeState, readJsonInput, writeJson } from "./state.js";

function takeOption(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  args.splice(index, 2);
  return value;
}

function debug(kind, value) {
  const enabled = process.env.STRAP_TOOLS_DEBUG === "1" || process.env.STRAP_DEBUG === "1";
  if (enabled) process.stderr.write(`${JSON.stringify({ kind, ...value })}\n`);
}

async function main(argv) {
  const args = [...argv];
  const group = takeOption(args, "--tools", args[0] || "all");
  const state = normalizeState(await readJsonInput(takeOption(args, "--file", "-")));
  const tools = toolMap(group);
  let executed = 0;

  for (const event of flattenVisible(state.root)) {
    for (const call of event.calls || []) {
      if (call.ok !== undefined) continue;
      debug("tool_call", { call });
      const tool = tools.get(call.tool);
      if (!tool) {
        call.ok = false;
        call.error = `Unknown tool: ${call.tool}`;
        debug("tool_result", { call });
        continue;
      }
      try {
        call.output = await tool.execute(call.input || {}, { state, event, call });
        call.ok = true;
      } catch (error) {
        call.ok = false;
        call.error = error.message;
      }
      debug("tool_result", { call });
      executed += 1;
    }
  }

  process.stderr.write(`executed ${executed} call(s)\n`);
  writeJson(state);
}

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
