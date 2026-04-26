import { publicToolSpec, toolMap } from "#strap/tools/registry";

function encodeMessage(message) {
  const json = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;
}

export function startMcpServer({ name = "strap", group = "all" } = {}) {
  const tools = toolMap(group);
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
      const result = await dispatch(message);
      send({ jsonrpc: "2.0", id: message.id, result });
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
        return { tools: [...tools.values()].map(publicToolSpec) };
      case "tools/call": {
        const toolName = message.params?.name;
        const tool = tools.get(toolName);
        if (!tool) throw new Error(`Unknown tool: ${toolName}`);
        return await tool.execute(message.params?.arguments || {});
      }
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
