#!/usr/bin/env node
import fs from "node:fs/promises";
import { CHATGPT_DEVICE_URL, defaultChatgptTokenFile, expandHome, importCodexChatgptToken, loadChatgptToken, loginChatgpt, refreshChatgptToken, tokenSummary } from "#strap/providers/chatgpt-auth";
import { writeJson } from "#strap/core/cli-io";

const [scope, command, ...args] = process.argv.slice(2);

if (scope !== "chatgpt") usage();

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

function usage() {
  console.error("Usage: strap auth chatgpt <login|import-codex|refresh|show|logout> [--token-file file]");
  process.exit(2);
}

function takeOption(values, name, fallback = undefined) {
  const index = values.indexOf(name);
  if (index === -1) return fallback;
  const value = values[index + 1];
  values.splice(index, 2);
  return value;
}

function takeFlag(values, name) {
  const index = values.indexOf(name);
  if (index === -1) return false;
  values.splice(index, 1);
  return true;
}
