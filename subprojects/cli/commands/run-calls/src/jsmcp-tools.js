import { asJsonRpcResult, callJsmcpHttp, ensureMemory } from "./jsmcp-http.js";
import { capabilityChangeError, diffListServers, diffListTools } from "./jsmcp-diff.js";

async function listServers(args, context) {
  const result = await callJsmcpHttp("list_servers", {}, context.state);
  ensureMemory(context.state).cachedListServers = { response: asJsonRpcResult(result) };
  return result;
}

async function listTools(args, context) {
  const server = String(args.server || "");
  const result = await callJsmcpHttp("list_tools", { server }, context.state);
  ensureMemory(context.state).cachedListTools[server] = { response: asJsonRpcResult(result) };
  return result;
}

async function refreshDiscovery(context) {
  const memory = ensureMemory(context.state);
  const changes = [];
  if (memory.cachedListServers) {
    const next = asJsonRpcResult(await callJsmcpHttp("list_servers", {}, context.state));
    const diff = diffListServers(memory.cachedListServers.response, next);
    if (diff) changes.push(diff);
    memory.cachedListServers = { response: next };
  }
  for (const [server, cached] of Object.entries(memory.cachedListTools || {})) {
    const next = asJsonRpcResult(await callJsmcpHttp("list_tools", { server }, context.state));
    const diff = diffListTools(server, cached.response, next);
    if (diff) changes.push(diff);
    memory.cachedListTools[server] = { response: next };
  }
  if (changes.length) throw capabilityChangeError({ changes });
}

async function executeCode(args, context) {
  await refreshDiscovery(context);
  return await callJsmcpHttp("execute_code", {
    code: String(args.code || ""),
    ...(args.data === undefined ? {} : { data: args.data }),
    timeoutMs: Number(args.timeout_ms || 120000),
  }, context.state);
}

export function jsmcpTools() {
  return [
    { name: "jsmcp_list_servers", execute: listServers },
    { name: "jsmcp_list_tools", execute: listTools },
    { name: "jsmcp_execute_code", execute: executeCode },
    { name: "jsmcp_fetch_logs", execute: (args, context) => callJsmcpHttp("fetch_logs", {}, context.state) },
    { name: "jsmcp_clear_logs", execute: (args, context) => callJsmcpHttp("clear_logs", {}, context.state) },
  ];
}
