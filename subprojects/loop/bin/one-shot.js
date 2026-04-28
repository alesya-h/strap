#!/usr/bin/env node
import { readStdin, takeOption, writeJson } from "#strap/core/cli-io";
import { loadProviderConfig } from "#strap/providers/config";
import { runOneShot } from "#strap/loop/one-shot";
import { loadAgent } from "#strap/core/profiles";

const [command, ...args] = process.argv.slice(2);

function usage() {
  console.error("Usage: strap one-shot run <task> --provider provider.json [--agent name] [--tools none|all|fs|process|web|agent|scripts|jsmcp] [--max-turns 8] [--dry-run] < context.json");
  process.exit(2);
}

function takeFlag(name) {
  const index = args.indexOf(name);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

if (command !== "run") usage();

const providerPath = takeOption(args, "--provider", "");
const agentName = takeOption(args, "--agent", "");
const toolsName = takeOption(args, "--tools", "none");
const maxTurns = Number(takeOption(args, "--max-turns", "8"));
const finalize = takeOption(args, "--finalize", "true") !== "false";
const dryRun = takeFlag("--dry-run");
const task = args.join(" ");
if (!task) usage();
if (!providerPath && !dryRun) usage();

const inputText = await readStdin();
const input = inputText.trim() ? JSON.parse(inputText) : undefined;
const provider = providerPath ? await loadProviderConfig(providerPath) : undefined;
const agentProfile = agentName ? loadAgent(agentName, { includePaths: true }) : undefined;
writeJson(await runOneShot({ input, task, provider, toolsName, maxTurns, finalize, dryRun, agentProfile }));
