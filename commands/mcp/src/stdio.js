import { spawn } from "node:child_process";
import path from "node:path";

function encodeMessage(message) {
  const json = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;
}

export function startMcpServer({ name = "strap", group = "all" } = {}) {
  let buffer = Buffer.alloc(0);
  process.stdin.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const header = buffer.slice(0, headerEnd).toString("utf8");
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) throw new Error("Missing Content-Length header");
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      if (buffer.length < bodyStart + length) return;
      const body = buffer.slice(bodyStart, bodyStart + length).toString("utf8");
      buffer = buffer.slice(bodyStart + length);
      void handle(JSON.parse(body));
    }
  });

  async function handle(message) {
    if (!message.id) return;
    try {
      send({ jsonrpc: "2.0", id: message.id, result: await dispatch(message) });
    } catch (error) {
      send({ jsonrpc: "2.0", id: message.id, error: { code: -32000, message: error.message } });
    }
  }

  async function dispatch(message) {
    switch (message.method) {
      case "initialize":
        return {
          protocolVersion: message.params?.protocolVersion || "2024-11-05",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name, version: "0.1.0" },
        };
      case "tools/list":
        return { tools: await listTools(group) };
      case "tools/call":
        return await callTool(group, message.params?.name, message.params?.arguments || {});
      case "ping":
        return {};
      default:
        throw new Error(`Unsupported MCP method: ${message.method}`);
    }
  }

  function send(message) {
    process.stdout.write(encodeMessage(message));
  }
}

async function listTools(group) {
  const seen = new Set();
  const out = [];
  for (const item of await toolsWithGroups(group)) {
    if (seen.has(item.tool.name)) continue;
    seen.add(item.tool.name);
    out.push(item.tool);
  }
  return out;
}

async function callTool(group, name, input) {
  const item = (await toolsWithGroups(group)).find((entry) => entry.tool.name === name);
  if (!item) throw new Error(`Unknown tool: ${name}`);
  const state = oneCallState(name, input);
  const next = await runStrapJson(["run-calls", "--tools", item.group], state);
  const call = findCallResult(next, name);
  if (!call.ok) throw new Error(call.error || `Tool failed: ${name}`);
  return call.output;
}

async function toolsWithGroups(group) {
  const tools = await runStrapJson(["tools", "list", "--group", String(group || "all"), "--json", "--internal"]);
  return tools.map((tool) => ({ group: tool.group, tool: publicTool(tool) }));
}

function publicTool(tool) {
  return {
    name: tool.name,
    description: tool.description || "",
    inputSchema: tool.inputSchema || { type: "object", properties: {}, additionalProperties: true },
  };
}

function findCallResult(state, toolName) {
  const stack = [state?.root].filter(Boolean);
  while (stack.length > 0) {
    const node = stack.pop();
    for (const call of node.calls || []) {
      if (call.tool === toolName) return call;
    }
    for (const child of node.children || []) stack.push(child);
  }
  throw new Error(`No tool result found for: ${toolName}`);
}

function oneCallState(tool, input) {
  return {
    version: "strap.state.v0.2",
    actors: {},
    root: {
      type: "scope",
      label: "root",
      status: "open",
      participants: ["assistant", "harness"],
      children: [{
        type: "event",
        from: "assistant",
        to: ["harness"],
        kind: "tool_request",
        calls: [{ id: "mcp-call", tool, input }],
      }],
    },
  };
}

function strapBin() {
  return process.env.STRAP_BIN || path.join(process.env.STRAP_ROOT || process.cwd(), "bin", "strap");
}

function runStrapJson(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(strapBin(), args, { env: process.env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(JSON.parse(stdout || "null"));
      else reject(new Error(stderr || stdout || `strap exited ${code}`));
    });
    child.stdin.end(input === undefined ? "" : `${JSON.stringify(input)}\n`);
  });
}
