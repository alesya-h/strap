#!/usr/bin/env node
import { normalizeState } from "#strap/core/state";
import { readJsonInput, takeOption, writeJson } from "#strap/core/cli-io";
import { agentRoots, applyAgentProfile, importOpenCodeAgents, listAgents, loadAgent } from "#strap/core/profiles";

const [command, ...args] = process.argv.slice(2);

function usage() {
  console.error("Usage: strap agents <list|show|apply|roots|import-opencode> [args]");
  process.exit(2);
}

function takeFlag(name) {
  const index = args.indexOf(name);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

if (!command) usage();

if (command === "list") {
  writeJson(listAgents({ includePaths: takeFlag("--paths") }).map((agent) => ({ ...agent, instructions: undefined })));
} else if (command === "show") {
  const name = args[0];
  if (!name) usage();
  writeJson(loadAgent(name, { includePaths: takeFlag("--paths") }));
} else if (command === "apply") {
  const name = args[0];
  const actor = takeOption(args, "--actor", "assistant");
  if (!name) usage();
  const state = normalizeState(await readJsonInput("-"));
  const profile = loadAgent(name, { includePaths: true });
  writeJson(applyAgentProfile(state, profile, actor));
} else if (command === "roots") {
  writeJson(agentRoots());
} else if (command === "import-opencode") {
  const source = args[0] || `${process.env.HOME}/.config/opencode/agents`;
  writeJson(importOpenCodeAgents(source));
} else {
  usage();
}
