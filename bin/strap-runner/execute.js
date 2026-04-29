import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { envFor, workspaceRoot } from "./env.js";

function debugCommand({ name, args, file, dir, cwd }) {
  if (process.env.STRAP_COMMANDS_DEBUG !== "1") return;
  process.stderr.write(`${JSON.stringify({ command: name, args, file, dir, cwd })}\n`);
}

function commandCwd(dir, env) {
  const wd = path.join(dir, "wd");
  if (!fs.existsSync(wd)) return workspaceRoot();
  const child = spawn(wd, [], { env, stdio: ["ignore", "pipe", "inherit"] });
  return new Promise((resolve, reject) => {
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(path.resolve(stdout.trim() || workspaceRoot()));
      else reject(new Error(`wd exited ${code}`));
    });
  });
}

export async function runExecutable(file, name, dir, args, die) {
  const env = envFor(name, dir);
  const cwd = await commandCwd(dir, env);
  debugCommand({ name, args, file, dir, cwd });
  const child = spawn(file, args, { cwd, env, stdio: "inherit" });
  child.on("error", (error) => die(error.message));
  child.on("close", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
}
