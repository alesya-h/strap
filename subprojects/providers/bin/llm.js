#!/usr/bin/env node
import { normalizeState } from "#strap/core/state";
import { readJsonInput, takeOption, writeJson } from "#strap/core/cli-io";
import { loadModelConfig } from "#strap/providers/config";
import { providerOperation } from "#strap/providers/provider-command";

const [command, ...args] = process.argv.slice(2);

function usage() {
  console.error("Usage: strap llm <compile|complete|call> [--model current|name|path.json] [--tools all|fs|process|web|agent|scripts|tools.json] < state.json");
  process.exit(2);
}

if (!command) usage();

const modelName = takeOption(args, "--model", "current");
const toolGroup = takeOption(args, "--tools", "all");
const state = normalizeState(await readJsonInput(takeOption(args, "--file", "-")));
const modelConfig = await loadModelConfig(modelName);

if (command === "compile") {
  writeJson(await providerOperation({ providerName: modelConfig.provider, command, state, modelConfig, toolsName: toolGroup }));
} else if (command === "call") {
  writeJson(await providerOperation({ providerName: modelConfig.provider, command, state, modelConfig, toolsName: toolGroup }));
} else if (command === "complete") {
  writeJson(await providerOperation({ providerName: modelConfig.provider, command, state, modelConfig, toolsName: toolGroup }));
} else {
  usage();
}
