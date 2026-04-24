#!/usr/bin/env node
import { appendEvent, compileChatMessages, compileOpenAIResponses, extractOpenAIResponseEvent, normalizeState } from "../src/state.js";
import { getTools } from "../src/registry.js";
import { readJsonInput, takeOption, writeJson } from "../src/cli-io.js";
import fs from "node:fs/promises";

const [command, ...args] = process.argv.slice(2);

function usage() {
  console.error("Usage: strap-llm <compile-openai|compile-chat|complete-openai|call-openai> [--model model] [--tools all|fs|process|web|agent|scripts|tools.json] < state.json");
  process.exit(2);
}

if (!command) usage();

const model = takeOption(args, "--model", "gpt-5.1");
const toolGroup = takeOption(args, "--tools", "all");
const tools = await loadTools(toolGroup);
const state = normalizeState(await readJsonInput(takeOption(args, "--file", "-")));

if (command === "compile-openai") {
  writeJson(compileOpenAIResponses(state, { model, tools }));
} else if (command === "compile-chat") {
  writeJson({ model, messages: compileChatMessages(state), tools: tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } })) });
} else if (command === "complete-openai" || command === "call-openai") {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is required");
  const body = compileOpenAIResponses(state, { model, tools });
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text);
  const providerResponse = JSON.parse(text);
  if (command === "call-openai") writeJson(providerResponse);
  else {
    appendEvent(state, extractOpenAIResponseEvent(providerResponse));
    writeJson(state);
  }
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
