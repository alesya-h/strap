import { appendEvent, compileChatMessages, compileOpenAIResponses, extractOpenAIResponseEvent, normalizeState, renderActorFrame } from "./state.js";
import { authHeaders, refreshProviderAuth } from "./provider-config.js";

export function compileProviderRequest(state, config, tools = []) {
  const normalized = normalizeState(state);
  if (config.provider === "anthropic") return compileAnthropicRequest(normalized, config, tools);
  if (config.api === "chat") return compileChatRequest(normalized, config, tools);
  return { ...compileOpenAIResponses(normalized, { model: config.model, tools }), ...(config.parameters || {}) };
}

export async function callProvider(state, config, tools = []) {
  const body = compileProviderRequest(state, config, tools);
  const response = await doProviderFetch(config, body);
  if (response.ok) return await response.json();
  if (response.status === 401 && await refreshProviderAuth(config)) {
    const retry = await doProviderFetch(config, body);
    if (retry.ok) return await retry.json();
    throw new Error(await formatProviderError(retry));
  }
  throw new Error(await formatProviderError(response));
}

export async function completeProvider(state, config, tools = []) {
  const providerResponse = await callProvider(state, config, tools);
  const event = responseToEvent(providerResponse, config);
  appendEvent(state, event);
  return state;
}

async function doProviderFetch(config, body) {
  const headers = {
    "content-type": "application/json",
    ...await authHeaders(config),
  };
  if (config.provider === "anthropic") {
    headers["anthropic-version"] ||= config.anthropic_version || "2023-06-01";
  }
  if (config.provider === "openrouter") {
    if (config.site_url) headers["HTTP-Referer"] ||= config.site_url;
    if (config.app_name) headers["X-Title"] ||= config.app_name;
  }
  return fetch(config.base_url, { method: "POST", headers, body: JSON.stringify(body) });
}

async function formatProviderError(response) {
  const text = await response.text();
  return `Provider call failed: ${response.status}: ${text}`;
}

function compileChatRequest(state, config, tools) {
  return {
    model: config.model,
    messages: compileChatMessages(state),
    ...(tools.length ? { tools: tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } })) } : {}),
    ...(config.parameters || {}),
  };
}

function compileAnthropicRequest(state, config, tools) {
  const messages = compileChatMessages(state).filter((message) => message.role !== "system");
  return {
    model: config.model,
    max_tokens: config.max_tokens || config.parameters?.max_tokens || 4096,
    system: renderActorFrame(state, "assistant"),
    messages: messages.map((message) => ({ role: message.role === "assistant" ? "assistant" : "user", content: message.content || "" })),
    ...(tools.length ? { tools: tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.inputSchema })) } : {}),
    ...(config.parameters || {}),
  };
}

function responseToEvent(response, config) {
  if (config.provider === "anthropic") return anthropicResponseToEvent(response);
  if (config.api === "chat") return chatResponseToEvent(response, config);
  return extractOpenAIResponseEvent(response);
}

function chatResponseToEvent(response, config) {
  const message = response.choices?.[0]?.message || {};
  const toolCalls = message.tool_calls || [];
  const calls = toolCalls.map((call) => ({
    id: call.id,
    tool: call.function?.name,
    input: parseJsonObject(call.function?.arguments),
    provider: { type: call.type, id: call.id },
  }));
  return {
    from: "assistant",
    to: calls.length ? ["harness"] : ["user"],
    kind: calls.length ? "tool_request" : "message",
    text: message.content || "",
    calls: calls.length ? calls : undefined,
    provider: { name: `${config.provider}.${config.api}`, id: response.id, model: response.model, usage: response.usage },
  };
}

function anthropicResponseToEvent(response) {
  const content = response.content || [];
  const text = content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
  const calls = content.filter((part) => part.type === "tool_use").map((part) => ({
    id: part.id,
    tool: part.name,
    input: part.input || {},
    provider: { type: part.type, id: part.id },
  }));
  return {
    from: "assistant",
    to: calls.length ? ["harness"] : ["user"],
    kind: calls.length ? "tool_request" : "message",
    text,
    calls: calls.length ? calls : undefined,
    provider: { name: "anthropic.messages", id: response.id, model: response.model, usage: response.usage },
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
