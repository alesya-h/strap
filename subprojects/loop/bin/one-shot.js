#!/usr/bin/env node
import { readStdin, takeOption, writeJson } from "#strap/core/cli-io";
import { loadModelConfig } from "#strap/providers/config";
import { runOneShot } from "#strap/loop/one-shot";
import { loadAgent, loadSkill } from "#strap/core/profiles";

const [command, ...args] = process.argv.slice(2);

function usage() {
  console.error("Usage: strap one-shot run <task> [--model current|name|path.json] [--agent name] [--skill name ...] [--tools none|all|fs|process|web|agent|scripts|jsmcp] [--max-turns 8] [--dry-run] < context.json");
  process.exit(2);
}

function takeFlag(name) {
  const index = args.indexOf(name);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

if (command !== "run") usage();

const modelName = takeOption(args, "--model", "current");
const agentName = takeOption(args, "--agent", "");
const skillNames = takeRepeatedOption(args, "--skill");
const toolsName = takeOption(args, "--tools", "none");
const maxTurns = Number(takeOption(args, "--max-turns", "8"));
const finalize = takeOption(args, "--finalize", "true") !== "false";
const dryRun = takeFlag("--dry-run");
const task = args.join(" ");
if (!task) usage();

const inputText = await readStdin();
const input = inputText.trim() ? JSON.parse(inputText) : undefined;
const provider = dryRun ? undefined : await loadModelConfig(modelName);
const agentProfile = agentName ? loadAgent(agentName, { includePaths: true }) : undefined;
const skillProfiles = skillNames.map((name) => loadSkill(name, { includePaths: true }));
writeJson(await runOneShot({ input, task, provider, toolsName, maxTurns, finalize, dryRun, agentProfile, skillProfiles }));

function takeRepeatedOption(values, name) {
  const output = [];
  while (values.includes(name)) {
    const index = values.indexOf(name);
    const value = values[index + 1];
    values.splice(index, value === undefined ? 1 : 2);
    if (value !== undefined) output.push(value);
  }
  return output;
}
