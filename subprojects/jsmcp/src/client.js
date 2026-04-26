import { spawn } from "node:child_process";

export async function callMcpTool({ command, args = [], tool, input = {}, timeoutMs = 120000 }) {
  const client = new StdioMcpClient(command, args, timeoutMs);
  try {
    await client.start();
    await client.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "strap", version: "0.1.0" },
    });
    client.notify("notifications/initialized", {});
    return await client.request("tools/call", { name: tool, arguments: input });
  } finally {
    await client.close();
  }
}

class StdioMcpClient {
  constructor(command, args, timeoutMs) {
    this.command = command;
    this.args = args;
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = Buffer.alloc(0);
  }

  async start() {
    this.child = spawn(this.command, this.args, { stdio: ["pipe", "pipe", "pipe"] });
    this.stderr = "";
    this.child.stderr.on("data", (chunk) => { this.stderr += chunk; });
    this.child.stdout.on("data", (chunk) => this.onData(chunk));
    this.child.on("error", (error) => {
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(error);
      }
      this.pending.clear();
    });
    this.child.on("exit", (code, signal) => {
      if (this.pending.size) {
        const error = new Error(`MCP process exited ${code ?? signal}: ${this.stderr}`);
        for (const { reject, timer } of this.pending.values()) {
          clearTimeout(timer);
          reject(error);
        }
        this.pending.clear();
      }
    });
  }

  request(method, params) {
    const id = this.nextId++;
    const message = { jsonrpc: "2.0", id, method, params };
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  notify(method, params) {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const lineEnd = this.buffer.indexOf("\n");
      if (lineEnd === -1) return;
      const raw = this.buffer.slice(0, lineEnd).toString("utf8").replace(/\r$/, "");
      this.buffer = this.buffer.slice(lineEnd + 1);
      if (raw.trim()) this.onMessage(JSON.parse(raw));
    }
  }

  onMessage(message) {
    if (message.id === undefined) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
    else pending.resolve(message.result);
  }

  async close() {
    if (!this.child) return;
    this.child.stdin.end();
    this.child.kill("SIGTERM");
  }
}
