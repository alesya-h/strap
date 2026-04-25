import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { readStdin } from "./cli-io.js";

export function porcelainDirs() {
  const configured = (process.env.STRAP_PORCELAIN_PATH || "").split(path.delimiter).filter(Boolean);
  return [...configured, path.resolve(process.cwd(), "porcelain")];
}

export async function listPorcelain() {
  const found = [];
  for (const dir of porcelainDirs()) {
    if (!fsSync.existsSync(dir)) continue;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".nu")) continue;
      const filePath = path.join(dir, entry.name);
      found.push({ name: path.basename(entry.name, ".nu"), path: filePath });
    }
  }
  return found;
}

export async function resolvePorcelain(nameOrPath) {
  if (!nameOrPath) throw new Error("Expected porcelain module name or path");
  const direct = path.resolve(nameOrPath);
  if (fsSync.existsSync(direct)) return direct;
  const withExt = path.resolve(`${nameOrPath}.nu`);
  if (fsSync.existsSync(withExt)) return withExt;
  for (const item of await listPorcelain()) {
    if (item.name === nameOrPath) return item.path;
  }
  throw new Error(`Porcelain module not found: ${nameOrPath}`);
}

export async function runPorcelain({ modulePath, command, args = [], inputJson }) {
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(command)) throw new Error(`Unsafe Nu command name: ${command}`);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "strap-porcelain-"));
  const argsPath = path.join(tmp, "args.json");
  const statePath = path.join(tmp, "state.json");
  const scriptPath = path.join(tmp, "run.nu");
  await fs.writeFile(argsPath, `${JSON.stringify(args)}\n`);
  await fs.writeFile(statePath, inputJson ?? await readStdin());
  const argExprs = args.map((_, index) => `($_args | get ${index})`).join(" ");
  const script = [
    `$env.STRAP_ROOT = '${escapeNuSingle(process.cwd())}'`,
    `use '${escapeNuSingle(modulePath)}' *`,
    `let _input = (open '${escapeNuSingle(statePath)}')`,
    `let _args = (open '${escapeNuSingle(argsPath)}')`,
    `$_input | ${command}${argExprs ? ` ${argExprs}` : ""} | to json`,
    "",
  ].join("\n");
  await fs.writeFile(scriptPath, script);
  try {
    return await runProcess("nu", [scriptPath], "");
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

function runProcess(command, args, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      if (error.code === "ENOENT") reject(new Error("Nushell executable `nu` was not found on PATH"));
      else reject(error);
    });
    child.on("close", (code, signal) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`nu exited ${code ?? signal}: ${stderr || stdout}`));
    });
    child.stdin.end(stdin);
  });
}

function escapeNuSingle(value) {
  return String(value).replaceAll("'", "''");
}
