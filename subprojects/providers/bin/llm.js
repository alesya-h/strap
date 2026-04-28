#!/usr/bin/env node
import { normalizeState } from "#strap/core/state";
import { getTools } from "#strap/tools/registry";
import { readJsonInput, takeOption, writeJson } from "#strap/core/cli-io";
import { loadModelConfig } from "#strap/providers/config";
import { callProvider, compileProviderRequest, completeProvider } from "#strap/providers/call";
import fs from "node:fs/promises";

const [command, ...args] = process.argv.slice(2);

function usage() {
  console.error("Usage: strap llm <compile|complete|call> [--model current|name|path.json] [--tools all|fs|process|web|agent|scripts|tools.json] < state.json");
  process.exit(2);
}

if (!command) usage();

const modelName = takeOption(args, "--model", "current");
const toolGroup = takeOption(args, "--tools", "all");
const tools = await loadTools(toolGroup);
const state = normalizeState(await readJsonInput(takeOption(args, "--file", "-")));
const modelConfig = await loadModelConfig(modelName);

if (command === "compile") {
  writeJson(compileProviderRequest(state, modelConfig, tools));
} else if (command === "call") {
  writeJson(await callProvider(state, modelConfig, tools));
} else if (command === "complete") {
  writeJson(await completeProvider(state, modelConfig, tools));
} else {
  usage();
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
