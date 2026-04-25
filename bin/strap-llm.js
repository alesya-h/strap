#!/usr/bin/env node
import { compileChatMessages, compileOpenAIResponses, normalizeState } from "../src/state.js";
import { getTools } from "../src/registry.js";
import { readJsonInput, takeOption, writeJson } from "../src/cli-io.js";
import { loadProviderConfig, normalizeProviderConfig } from "../src/provider-config.js";
import { callProvider, compileProviderRequest, completeProvider } from "../src/provider-call.js";
import fs from "node:fs/promises";

const [command, ...args] = process.argv.slice(2);

function usage() {
  console.error("Usage: strap-llm <compile|complete|call|compile-openai|compile-chat|complete-openai|call-openai> [--provider provider.json] [--model model] [--tools all|fs|process|web|agent|scripts|tools.json] < state.json");
  process.exit(2);
}

if (!command) usage();

const providerPath = takeOption(args, "--provider");
const model = takeOption(args, "--model", "gpt-5.1");
const toolGroup = takeOption(args, "--tools", "all");
const tools = await loadTools(toolGroup);
const state = normalizeState(await readJsonInput(takeOption(args, "--file", "-")));
const providerConfig = providerPath
  ? await loadProviderConfig(providerPath)
  : normalizeProviderConfig({ provider: "openai", api: command.endsWith("chat") ? "chat" : "responses", model });

if (command === "compile") {
  writeJson(compileProviderRequest(state, providerConfig, tools));
} else if (command === "call") {
  writeJson(await callProvider(state, providerConfig, tools));
} else if (command === "complete") {
  writeJson(await completeProvider(state, providerConfig, tools));
} else if (command === "compile-openai") {
  writeJson(compileOpenAIResponses(state, { model, tools }));
} else if (command === "compile-chat") {
  writeJson({ model, messages: compileChatMessages(state), tools: tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } })) });
} else if (command === "complete-openai" || command === "call-openai") {
  const openaiConfig = normalizeProviderConfig({ provider: "openai", api: "responses", model, auth: providerConfig.auth, base_url: providerConfig.base_url, headers: providerConfig.headers });
  if (command === "call-openai") writeJson(await callProvider(state, openaiConfig, tools));
  else writeJson(await completeProvider(state, openaiConfig, tools));
} else {
  usage();
}

async function loadTools(spec) {
  if (!spec || ["all", "fs", "process", "web", "agent", "scripts"].includes(spec)) return getTools(spec || "all");
  const parsed = JSON.parse(await fs.readFile(spec, "utf8"));
  const tools = Array.isArray(parsed) ? parsed : parsed.tools || [];
  return tools.map((tool) => ({
    name: tool.name || tool.function?.name,
    description: tool.description || tool.function?.description || "",
    inputSchema: tool.inputSchema || tool.input_schema || tool.parameters || tool.function?.parameters || { type: "object", properties: {} },
  }));
}
