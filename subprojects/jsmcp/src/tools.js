import { callMcpTool } from "#strap/jsmcp/client";
import { toolResult } from "#strap/core/result";
import { integerSchema, objectSchema, optionalInteger, optionalString, requireString, stringSchema } from "#strap/core/schemas";

function jsmcpCommand() {
  const command = process.env.STRAP_JSMCP_COMMAND || "jsmcp";
  const args = (process.env.STRAP_JSMCP_ARGS || "client").split(/\s+/).filter(Boolean);
  return { command, args };
}

async function callJsmcp(tool, input, timeoutMs) {
  const { command, args } = jsmcpCommand();
  const result = await callMcpTool({ command, args, tool, input, timeoutMs });
  return result?.content ? result : toolResult(result || {});
}

export function jsmcpTools() {
  return [
    {
      name: "jsmcp_list_servers",
      description: "List jsmcp MCP server namespaces and startup status. Call this before using other jsmcp tools.",
      inputSchema: objectSchema({
        timeout_ms: integerSchema("Timeout in milliseconds", { minimum: 1 }),
      }, []),
      readOnly: true,
      execute: (args) => callJsmcp("list_servers", {}, optionalInteger(args, "timeout_ms", 120000)),
    },
    {
      name: "jsmcp_list_tools",
      description: "List allowed tools for a jsmcp server namespace.",
      inputSchema: objectSchema({
        server: stringSchema("jsmcp server namespace"),
        timeout_ms: integerSchema("Timeout in milliseconds", { minimum: 1 }),
      }, ["server"]),
      readOnly: true,
      execute: (args) => callJsmcp("list_tools", { server: requireString(args, "server") }, optionalInteger(args, "timeout_ms", 120000)),
    },
    {
      name: "jsmcp_execute_code",
      description: "Execute JavaScript against jsmcp server namespaces after listing servers/tools.",
      inputSchema: objectSchema({
        code: stringSchema("JavaScript async function body to execute"),
        data: { type: "object", description: "Optional data exposed to code as global data", additionalProperties: true },
        timeout_ms: integerSchema("Timeout in milliseconds", { minimum: 1 }),
      }, ["code"]),
      readOnly: false,
      openWorld: true,
      execute: (args) => callJsmcp("execute_code", {
        code: requireString(args, "code"),
        ...(args.data === undefined ? {} : { data: args.data }),
        timeoutMs: optionalInteger(args, "timeout_ms", 120000),
      }, optionalInteger(args, "timeout_ms", 120000) + 5000),
    },
    {
      name: "jsmcp_fetch_logs",
      description: "Fetch and clear logs emitted by jsmcp_execute_code console methods.",
      inputSchema: objectSchema({ timeout_ms: integerSchema("Timeout in milliseconds", { minimum: 1 }) }, []),
      readOnly: true,
      execute: (args) => callJsmcp("fetch_logs", {}, optionalInteger(args, "timeout_ms", 120000)),
    },
    {
      name: "jsmcp_clear_logs",
      description: "Clear logs emitted by jsmcp_execute_code console methods.",
      inputSchema: objectSchema({ timeout_ms: integerSchema("Timeout in milliseconds", { minimum: 1 }) }, []),
      readOnly: false,
      execute: (args) => callJsmcp("clear_logs", {}, optionalInteger(args, "timeout_ms", 120000)),
    },
  ];
}
