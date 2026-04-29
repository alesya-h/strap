import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { resolveInWorkspace } from "./paths.js";
import { toolResult, truncateText } from "./result.js";

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
  const cwd = resolveInWorkspace(args.workdir || ".");
  let runner = "bash";
  let runnerArgs = ["-lc", String(args.command ?? "")];
  if (args.read_only_filesystem) {
    if (!await hasCommand("bwrap")) throw new Error("read_only_filesystem requires bubblewrap (bwrap) on PATH");
    runner = "bwrap";
    runnerArgs = ["--ro-bind", "/", "/", "--dev", "/dev", "--proc", "/proc", "--tmpfs", "/tmp", "--chdir", cwd, "bash", "-lc", String(args.command ?? "")];
  }
  const result = await runProcess(runner, runnerArgs, { cwd, timeout: Number(args.timeout_ms || 120000) });
  const output = [result.stdout, result.stderr ? `\n[stderr]\n${result.stderr}` : ""].join("");
  const limited = truncateText(output, Number(args.max_output_bytes || 40000));
  return toolResult(limited.text, { exitCode: result.code, signal: result.signal, truncated: limited.truncated, description: args.description || "" });
}

async function nuEval(args) {
  const result = await runProcess("nu", ["-c", String(args.command ?? "")], { cwd: resolveInWorkspace(args.workdir || "."), timeout: Number(args.timeout_ms || 120000) });
  const limited = truncateText([result.stdout, result.stderr ? `\n[stderr]\n${result.stderr}` : ""].join(""), Number(args.max_output_bytes || 40000));
  return toolResult(limited.text, { exitCode: result.code, signal: result.signal, truncated: limited.truncated });
}

async function tmux(args) {
  const tmuxArgs = [String(args.subcommand ?? ""), ...String(args.arguments || "").split(" ").filter(Boolean)];
  const result = await runProcess("tmux", tmuxArgs, { timeout: Number(args.timeout_ms || 30000) });
  return toolResult([result.stdout, result.stderr ? `\n[stderr]\n${result.stderr}` : ""].join(""), { exitCode: result.code, signal: result.signal });
}

async function tmuxCapture(args) {
  const tmuxArgs = ["capture-pane", "-p", "-S", `-${Number(args.lines || 200)}`];
  if (args.target) tmuxArgs.push("-t", String(args.target));
  const result = await runProcess("tmux", tmuxArgs, { timeout: 30000 });
  return toolResult(result.stdout || result.stderr, { exitCode: result.code, signal: result.signal });
}

async function tmuxSend(args) {
  const tmuxArgs = ["send-keys"];
  if (args.target) tmuxArgs.push("-t", String(args.target));
  tmuxArgs.push(String(args.text ?? ""));
  if (args.enter !== false) tmuxArgs.push("Enter");
  const result = await runProcess("tmux", tmuxArgs, { timeout: 30000 });
  return toolResult(result.stdout || result.stderr || "sent", { exitCode: result.code, signal: result.signal });
}

export function processTools() {
  return [
    { name: "shell", execute: shell },
    { name: "nu_eval", execute: nuEval },
    { name: "tmux", execute: tmux },
    { name: "tmux_capture", execute: tmuxCapture },
    { name: "tmux_send", execute: tmuxSend },
  ];
}
