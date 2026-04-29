function envEnabled(name) {
  const value = process.env[name];
  if (value === undefined) return false;
  return !["", "0", "false", "no", "off"].includes(String(value).toLowerCase());
}

export function debugJson(kind, payload) {
  process.stderr.write(`[strap:${kind}] ${JSON.stringify(payload)}\n`);
}

export function commandsDebugEnabled() {
  return envEnabled("STRAP_COMMANDS_DEBUG");
}

export function toolsDebugEnabled() {
  return envEnabled("STRAP_TOOLS_DEBUG");
}

export function debugCommand(payload) {
  if (commandsDebugEnabled()) debugJson("command", payload);
}

export function debugToolCall(call) {
  if (!toolsDebugEnabled()) return;
  debugJson("tool_call", {
    id: call.id,
    tool: call.tool,
    input: call.input || {},
  });
}

export function debugToolResult(call) {
  if (!toolsDebugEnabled()) return;
  debugJson("tool_result", {
    id: call.id,
    tool: call.tool,
    ok: call.ok,
    output: call.output,
    error: call.error,
  });
}
