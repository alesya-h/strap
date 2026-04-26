import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { resolveInWorkspace } from "#strap/core/paths";
import { toolResult, truncateText } from "#strap/core/result";
import { booleanSchema, integerSchema, objectSchema, optionalBoolean, optionalInteger, optionalString, requireString, stringSchema } from "#strap/core/schemas";

const execFileAsync = promisify(execFile);

async function hasCommand(command) {
  try {
    await execFileAsync("command", ["-v", command], { shell: true });
    return true;
  } catch {
    return false;
  }
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

async function shell(args) {
  const command = requireString(args, "command");
  const timeoutMs = optionalInteger(args, "timeout_ms", 120000);
  const cwd = resolveInWorkspace(optionalString(args, "workdir", "."));
  const readOnlyFilesystem = optionalBoolean(args, "read_only_filesystem", false);
  let runner = "bash";
  let runnerArgs = ["-lc", command];
  if (readOnlyFilesystem) {
    if (!await hasCommand("bwrap")) throw new Error("read_only_filesystem requires bubblewrap (bwrap) on PATH");
    runner = "bwrap";
    runnerArgs = ["--ro-bind", "/", "/", "--dev", "/dev", "--proc", "/proc", "--tmpfs", "/tmp", "--chdir", cwd, "bash", "-lc", command];
  }
  const result = await runProcess(runner, runnerArgs, { cwd, timeout: timeoutMs });
  const output = [result.stdout, result.stderr ? `\n[stderr]\n${result.stderr}` : ""].join("");
  const truncated = truncateText(output, optionalInteger(args, "max_output_bytes", 40000));
  return toolResult(truncated.text, {
    exitCode: result.code,
    signal: result.signal,
    truncated: truncated.truncated,
    description: optionalString(args, "description", ""),
  });
}

async function nuEval(args) {
  const command = requireString(args, "command");
  const timeoutMs = optionalInteger(args, "timeout_ms", 120000);
  const cwd = resolveInWorkspace(optionalString(args, "workdir", "."));
  const result = await runProcess("nu", ["-c", command], { cwd, timeout: timeoutMs });
  const output = [result.stdout, result.stderr ? `\n[stderr]\n${result.stderr}` : ""].join("");
  const truncated = truncateText(output, optionalInteger(args, "max_output_bytes", 40000));
  return toolResult(truncated.text, { exitCode: result.code, signal: result.signal, truncated: truncated.truncated });
}

async function tmux(args) {
  const subcommand = requireString(args, "subcommand");
  const tmuxArgs = [subcommand, ...String(optionalString(args, "arguments", "")).split(" ").filter(Boolean)];
  const result = await runProcess("tmux", tmuxArgs, { timeout: optionalInteger(args, "timeout_ms", 30000) });
  const output = [result.stdout, result.stderr ? `\n[stderr]\n${result.stderr}` : ""].join("");
  return toolResult(output, { exitCode: result.code, signal: result.signal });
}

async function tmuxCapture(args) {
  const target = optionalString(args, "target", "");
  const lines = optionalInteger(args, "lines", 200);
  const tmuxArgs = ["capture-pane", "-p", "-S", `-${lines}`];
  if (target) tmuxArgs.push("-t", target);
  const result = await runProcess("tmux", tmuxArgs, { timeout: 30000 });
  return toolResult(result.stdout || result.stderr, { exitCode: result.code, signal: result.signal });
}

async function tmuxSend(args) {
  const text = requireString(args, "text");
  const target = optionalString(args, "target", "");
  const enter = optionalBoolean(args, "enter", true);
  const tmuxArgs = ["send-keys"];
  if (target) tmuxArgs.push("-t", target);
  tmuxArgs.push(text);
  if (enter) tmuxArgs.push("Enter");
  const result = await runProcess("tmux", tmuxArgs, { timeout: 30000 });
  return toolResult(result.stdout || result.stderr || "sent", { exitCode: result.code, signal: result.signal });
}

export function processTools() {
  return [
    {
      name: "shell",
      description: "Run a bash command in the workspace. Prefer dedicated file/search tools for routine filesystem work.",
      inputSchema: objectSchema({
        command: stringSchema("Bash command to run"),
        workdir: stringSchema("Workspace-relative working directory"),
        timeout_ms: integerSchema("Timeout in milliseconds", { minimum: 1 }),
        max_output_bytes: integerSchema("Maximum output bytes returned to the model", { minimum: 1 }),
        description: stringSchema("Short audit-friendly description of intent"),
        read_only_filesystem: booleanSchema("Run through bubblewrap with a read-only root filesystem"),
      }, ["command"]),
      readOnly: false,
      destructive: true,
      execute: shell,
    },
    {
      name: "nu_eval",
      description: "Run a Nushell command in the workspace.",
      inputSchema: objectSchema({
        command: stringSchema("Nushell command to run"),
        workdir: stringSchema("Workspace-relative working directory"),
        timeout_ms: integerSchema("Timeout in milliseconds", { minimum: 1 }),
        max_output_bytes: integerSchema("Maximum output bytes returned to the model", { minimum: 1 }),
      }, ["command"]),
      readOnly: false,
      destructive: true,
      execute: nuEval,
    },
    {
      name: "tmux",
      description: "Run a tmux subcommand. Use narrower tmux_capture and tmux_send when possible.",
      inputSchema: objectSchema({
        subcommand: stringSchema("tmux subcommand, for example list-sessions"),
        arguments: stringSchema("Space-separated arguments"),
        timeout_ms: integerSchema("Timeout in milliseconds", { minimum: 1 }),
      }, ["subcommand"]),
      readOnly: false,
      destructive: true,
      execute: tmux,
    },
    {
      name: "tmux_capture",
      description: "Capture recent text from a tmux pane.",
      inputSchema: objectSchema({
        target: stringSchema("Optional tmux target pane"),
        lines: integerSchema("Number of recent lines", { minimum: 1 }),
      }, []),
      readOnly: true,
      execute: tmuxCapture,
    },
    {
      name: "tmux_send",
      description: "Send keys to a tmux pane.",
      inputSchema: objectSchema({
        target: stringSchema("Optional tmux target pane"),
        text: stringSchema("Text or key name to send"),
        enter: booleanSchema("Whether to send Enter after text"),
      }, ["text"]),
      readOnly: false,
      destructive: true,
      execute: tmuxSend,
    },
  ];
}
