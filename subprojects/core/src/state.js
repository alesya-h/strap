import fs from "node:fs/promises";

export function createState() {
  return {
    version: "strap.state.v0.2",
    actors: {
      user: {
        kind: "human",
        self: { public: "The user driving the work." },
        peers: {
          assistant: { contract: "Collaborate directly, preserve user intent, ask only when blocked." },
        },
      },
      assistant: {
        kind: "agent",
        self: {
          public: "A pragmatic software agent operating a unix-ish harness.",
          private: "Keep provider-specific state out of canonical state; compile requests from this file.",
        },
        peers: {
          user: { contract: "Solve the task end-to-end when feasible; keep updates concise." },
          harness: { contract: "Use tool calls as structured actor communication." },
        },
      },
      harness: {
        kind: "runtime",
        self: { public: "The local execution harness, MCP bridge, and provider adapter." },
        peers: {
          assistant: { contract: "Execute approved calls, report visible output, keep retained hidden state available." },
        },
      },
    },
    root: {
      type: "scope",
      label: "root",
      status: "open",
      participants: ["user", "assistant", "harness"],
      children: [],
    },
  };
}

export async function readState(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function writeState(filePath, state) {
  await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`);
}

export function normalizeState(input) {
  if (input?.root?.type === "scope") return input;
  throw new Error("Expected strap.state.v0.2 state with root scope");
}

export function appendEvent(state, event) {
  state.root.children.push({ type: "event", ...event });
  return state;
}

export function openScope(state, label, participants = ["assistant", "harness"]) {
  state.root.children.push({ type: "scope", label, status: "open", participants, children: [] });
  return state;
}

export function collapseLastOpenScope(state, summary) {
  const scope = [...state.root.children].reverse().find((node) => node.type === "scope" && node.status === "open");
  if (!scope) throw new Error("No open scope found");
  scope.status = "collapsed";
  scope.summary = summary;
  scope.hidden = { children: scope.children };
  scope.children = [];
  return state;
}

export function renderSections(sections) {
  return Object.entries(sections || {})
    .map(([key, value]) => `<${key}>\n${value}\n</${key}>`)
    .join("\n\n");
}

export function renderActorFrame(state, actorId = "assistant") {
  const actor = state.actors?.[actorId] || {};
  const chunks = [];
  if (actor.self?.public) chunks.push(`<self_public>\n${actor.self.public}\n</self_public>`);
  if (actor.self?.private) chunks.push(`<self_private>\n${actor.self.private}\n</self_private>`);
  for (const skillName of actor.skills || []) {
    const instruction = actor.skill_instructions?.[skillName];
    if (instruction) chunks.push(`<skill name=${JSON.stringify(skillName)}>\n${instruction}\n</skill>`);
  }
  for (const [peer, relation] of Object.entries(actor.peers || {})) {
    if (relation.public) chunks.push(`<peer name="${peer}" field="public">\n${relation.public}\n</peer>`);
    if (relation.inferred) chunks.push(`<peer name="${peer}" field="inferred">\n${relation.inferred}\n</peer>`);
    if (relation.contract) chunks.push(`<contract peer="${peer}">\n${relation.contract}\n</contract>`);
  }
  return chunks.join("\n\n");
}

export function flattenVisible(node, output = []) {
  if (!node) return output;
  if (node.type === "event") {
    output.push(node);
    return output;
  }
  if (node.type === "scope") {
    if (node.status === "collapsed") {
      output.push({ type: "event", from: "harness", to: node.participants || [], kind: "summary", text: node.summary || `[collapsed scope: ${node.label}]` });
      return output;
    }
    for (const child of node.children || []) flattenVisible(child, output);
  }
  return output;
}

export function eventToText(event) {
  const prefix = `[${event.from} -> ${Array.isArray(event.to) ? event.to.join(",") : event.to || "all"}; ${event.kind || "message"}]`;
  const calls = event.calls?.length ? `\n<calls>\n${JSON.stringify(event.calls, null, 2)}\n</calls>` : "";
  const results = event.results?.length ? `\n<results>\n${JSON.stringify(event.results, null, 2)}\n</results>` : "";
  return `${prefix}\n${event.text || ""}${calls}${results}`.trim();
}

export function compileChatMessages(state, actorId = "assistant") {
  const normalized = normalizeState(state);
  const messages = [{ role: "system", content: renderActorFrame(normalized, actorId) }];
  for (const event of flattenVisible(normalized.root)) {
    if (event.from === actorId) messages.push({ role: "assistant", content: eventToText(event) });
    else messages.push({ role: "user", content: eventToText(event) });
  }
  return messages;
}

export function compileOpenAIResponses(state, { model = "gpt-5.1", actor = "assistant", tools = [] } = {}) {
  const normalized = normalizeState(state);
  return {
    model,
    instructions: renderActorFrame(normalized, actor),
    input: flattenVisible(normalized.root).map(eventToText).join("\n\n"),
    tools: tools.map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    })),
  };
}

export function extractOpenAIResponseEvent(response) {
  const output = response.output || [];
  const text = response.output_text || output
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text" || part.type === "text")
    .map((part) => part.text || "")
    .join("\n");
  const calls = output
    .filter((item) => item.type === "function_call")
    .map((item) => ({
      id: item.call_id || item.id,
      tool: item.name,
      input: parseJsonObject(item.arguments),
      provider: { type: item.type, id: item.id, call_id: item.call_id },
    }));
  return {
    from: "assistant",
    to: calls.length ? ["harness"] : ["user"],
    kind: calls.length ? "tool_request" : "message",
    text,
    calls: calls.length ? calls : undefined,
    provider: {
      name: "openai.responses",
      id: response.id,
      model: response.model,
      usage: response.usage,
    },
  };
}

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return { raw: String(value) };
  }
}
