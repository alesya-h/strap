import { callMcpTool } from "./jsmcp-client.js";
import { toolResult } from "./result.js";

function jsmcpCommand() {
  return {
    command: process.env.STRAP_JSMCP_COMMAND || "jsmcp",
    args: (process.env.STRAP_JSMCP_ARGS || "client").split(/\s+/).filter(Boolean),
  };
}

async function callJsmcp(tool, input, timeoutMs) {
  const { command, args } = jsmcpCommand();
  const result = await callMcpTool({ command, args, tool, input, timeoutMs });
  return result?.content ? result : toolResult(result || {});
}

export function jsmcpTools() {
  return [
    { name: "jsmcp_list_servers", execute: (args) => callJsmcp("list_servers", {}, Number(args.timeout_ms || 120000)) },
    { name: "jsmcp_list_tools", execute: (args) => callJsmcp("list_tools", { server: String(args.server || "") }, Number(args.timeout_ms || 120000)) },
    { name: "jsmcp_execute_code", execute: (args) => callJsmcp("execute_code", { code: String(args.code || ""), ...(args.data === undefined ? {} : { data: args.data }), timeoutMs: Number(args.timeout_ms || 120000) }, Number(args.timeout_ms || 120000) + 5000) },
    { name: "jsmcp_fetch_logs", execute: (args) => callJsmcp("fetch_logs", {}, Number(args.timeout_ms || 120000)) },
    { name: "jsmcp_clear_logs", execute: (args) => callJsmcp("clear_logs", {}, Number(args.timeout_ms || 120000)) },
  ];
}
