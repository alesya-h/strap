import { agentTools } from "#strap/tools/agent-tools";
import { fsTools } from "#strap/tools/fs-tools";
import { processTools } from "#strap/tools/process-tools";
import { jsmcpTools } from "#strap/jsmcp/tools";
import { scriptTools } from "#strap/tools/script-tools";
import { webTools } from "#strap/tools/web-tools";

export function getTools(group = "all") {
  const groups = {
    fs: fsTools(),
    process: processTools(),
    web: webTools(),
    agent: agentTools(),
    scripts: scriptTools(),
    jsmcp: jsmcpTools(),
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
  };
}
