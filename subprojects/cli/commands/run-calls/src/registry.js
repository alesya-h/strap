import { agentTools } from "./agent-tools.js";
import { fsReadTools } from "./fs-read.js";
import { fsWriteTools } from "./fs-write.js";
import { jsmcpTools } from "./jsmcp-tools.js";
import { processTools } from "./process-tools.js";
import { scriptTools } from "./scripts.js";
import { webTools } from "./web-tools.js";

export function getTools(group = "all") {
  const groups = {
    fs: [...fsReadTools(), ...fsWriteTools()],
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
