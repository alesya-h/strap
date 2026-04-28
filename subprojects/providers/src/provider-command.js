import fs from "node:fs/promises";
import { normalizeState } from "#strap/core/state";
import { getTools } from "#strap/tools/registry";
import { callProvider, compileProviderRequest, completeProvider } from "#strap/providers/call";

export const PROVIDERS = ["anthropic", "chatgpt", "openai", "openrouter"];

export async function providerOperation({ providerName, command, state, modelConfig, toolsName = "all" }) {
  if (!PROVIDERS.includes(providerName)) throw new Error(`Unknown provider: ${providerName}`);
  if (modelConfig.provider !== providerName) throw new Error(`Model profile provider mismatch: expected ${providerName}, got ${modelConfig.provider}`);
  const tools = await loadTools(toolsName);
  const normalized = normalizeState(state);
  if (command === "compile") return compileProviderRequest(normalized, modelConfig, tools);
  if (command === "call") return await callProvider(normalized, modelConfig, tools);
  if (command === "complete") return await completeProvider(normalized, modelConfig, tools);
  throw new Error(`Unknown provider operation: ${command}`);
}

async function loadTools(spec) {
  if (spec === "none") return [];
  if (!spec || ["all", "fs", "process", "web", "agent", "scripts", "jsmcp"].includes(spec)) return getTools(spec || "all");
  const parsed = JSON.parse(await fs.readFile(spec, "utf8"));
  const tools = Array.isArray(parsed) ? parsed : parsed.tools || [];
  return tools.map((tool) => ({
    name: tool.name || tool.function?.name,
    description: tool.description || tool.function?.description || "",
    inputSchema: tool.inputSchema || tool.input_schema || tool.parameters || tool.function?.parameters || { type: "object", properties: {} },
  }));
}
