#!/usr/bin/env node
import { compileChatMessages, compileOpenAIResponses, normalizeState, readState } from "../src/state.js";
import { getTools } from "../src/registry.js";

const [command, statePath, ...args] = process.argv.slice(2);

function getArg(name, fallback = undefined) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
}

function usage() {
  console.error("Usage: strap-llm <compile-openai|compile-chat|call-openai> <state.json> [--model model] [--tools all|fs|process|web|agent]");
  process.exit(2);
}

if (!command || !statePath) usage();

const state = normalizeState(await readState(statePath));
const model = getArg("--model", "gpt-5.1");
const toolGroup = getArg("--tools", "all");
const tools = getTools(toolGroup);

if (command === "compile-openai") {
  console.log(JSON.stringify(compileOpenAIResponses(state, { model, tools }), null, 2));
} else if (command === "compile-chat") {
  console.log(JSON.stringify({ model, messages: compileChatMessages(state), tools: tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } })) }, null, 2));
} else if (command === "call-openai") {
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
  console.log(text);
} else {
  usage();
}
