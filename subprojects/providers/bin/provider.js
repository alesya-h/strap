#!/usr/bin/env node
import fs from "node:fs/promises";
import { defaultChatgptTokenFile, expandHome, importCodexChatgptToken, loadChatgptToken, loginChatgpt, refreshChatgptToken, tokenSummary } from "#strap/providers/chatgpt-auth";
import { readJsonInput, takeOption, writeJson } from "#strap/core/cli-io";
import { loadModelConfig } from "#strap/providers/config";
import { PROVIDERS, providerOperation } from "#strap/providers/provider-command";

const [providerName, command, ...args] = process.argv.slice(2);

if (!providerName) usage();
if (providerName === "list") {
  writeJson(PROVIDERS);
  process.exit(0);
}
if (!PROVIDERS.includes(providerName)) usage();

if (command === "auth") {
  if (providerName !== "chatgpt") throw new Error(`Provider ${providerName} has no auth subcommands`);
  await chatgptAuth(args);
} else if (["compile", "call", "complete"].includes(command)) {
  const modelName = takeOption(args, "--model", "current");
  const toolsName = takeOption(args, "--tools", "all");
  const modelConfig = await loadModelConfig(modelName);
  const state = await readJsonInput(takeOption(args, "--file", "-"));
  writeJson(await providerOperation({ providerName, command, state, modelConfig, toolsName }));
} else {
  usage();
}

async function chatgptAuth(args) {
  const command = args.shift();
  const tokenFile = takeOption(args, "--token-file", defaultChatgptTokenFile());
  if (command === "login") {
    const noOpen = takeFlag(args, "--no-open");
    const timeout = Number(takeOption(args, "--timeout-seconds", "300"));
    writeJson(await loginChatgpt({
      token_file: tokenFile,
      open: !noOpen,
      timeout_seconds: timeout,
      onUserCode: ({ userCode, url }) => process.stderr.write(`Open ${url} and enter code: ${userCode}\n`),
    }));
  } else if (command === "import-codex") {
    const authFile = takeOption(args, "--auth-file");
    writeJson(await importCodexChatgptToken({ auth_file: authFile, token_file: tokenFile }));
  } else if (command === "refresh") {
    const token = await loadChatgptToken({ token_file: tokenFile, refresh: false });
    const refreshed = await refreshChatgptToken({ token, tokenFile: expandHome(tokenFile) });
    writeJson({ tokenFile: expandHome(tokenFile), ...tokenSummary(refreshed) });
  } else if (command === "show") {
    const token = await loadChatgptToken({ token_file: tokenFile, refresh: false });
    writeJson({ tokenFile: expandHome(tokenFile), ...tokenSummary(token) });
  } else if (command === "logout") {
    await fs.rm(expandHome(tokenFile), { force: true });
    writeJson({ ok: true, tokenFile: expandHome(tokenFile) });
  } else {
    usage();
  }
}

function usage() {
  console.error("Usage: strap provider <anthropic|chatgpt|openai|openrouter> <compile|call|complete> [--model current] [--tools all] < state.json\n       strap provider chatgpt auth <login|import-codex|refresh|show|logout> [--token-file file]\n       strap provider list");
  process.exit(2);
}

function takeFlag(values, name) {
  const index = values.indexOf(name);
  if (index === -1) return false;
  values.splice(index, 1);
  return true;
}
