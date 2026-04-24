import { agentTools } from "./agent-tools.js";
import { fsTools } from "./fs-tools.js";
import { processTools } from "./process-tools.js";
import { scriptTools } from "./script-tools.js";
import { webTools } from "./web-tools.js";

export function getTools(group = "all") {
  const groups = {
    fs: fsTools(),
    process: processTools(),
    web: webTools(),
    agent: agentTools(),
    scripts: scriptTools(),
  };
  if (group === "all") return Object.values(groups).flat();
  if (!groups[group]) throw new Error(`Unknown tool group: ${group}`);
  return groups[group];
}

export function toolMap(group = "all") {
  return new Map(getTools(group).map((tool) => [tool.name, tool]));
}

export function publicToolSpec(tool) {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: {
      readOnlyHint: Boolean(tool.readOnly),
      destructiveHint: Boolean(tool.destructive),
      openWorldHint: Boolean(tool.openWorld),
    },
  };
}
