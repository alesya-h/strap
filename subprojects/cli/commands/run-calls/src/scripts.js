import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { strapConfigRoot, strapGlobalRoot, strapProjectRoot, strapRoot, strapSessionRoot, strapToolDirs, strapWorkRoot, workspaceRoot } from "./paths.js";
import { toolResult, truncateText } from "./result.js";

const defaultSchema = { type: "object", properties: {}, additionalProperties: true };

function safeName(fileName) {
  return path.basename(fileName).replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]/g, "_");
}

function readJson(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : undefined;
}

function executable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function discover() {
  const seen = new Set();
  const files = [];
  for (const dir of strapToolDirs()) {
    const resolved = path.resolve(dir);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) continue;
    for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name.endsWith(".json")) continue;
      const file = path.join(resolved, entry.name);
      if (executable(file) && !seen.has(file)) {
        seen.add(file);
        files.push(file);
      }
    }
  }
  return files;
}

function specFor(file) {
  const sidecar = readJson(`${file}.json`) || readJson(file.replace(/\.[^.]+$/, ".json")) || {};
  return {
    name: sidecar.name || safeName(file),
    description: sidecar.description || `Run script tool ${path.basename(file)}.`,
    inputSchema: sidecar.inputSchema || sidecar.input_schema || sidecar.parameters || defaultSchema,
    timeoutMs: Number(sidecar.timeoutMs || sidecar.timeout_ms || 120000),
    maxOutputBytes: Number(sidecar.maxOutputBytes || sidecar.max_output_bytes || 60000),
  };
}

function runScript(file, input, spec) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, [], { cwd: workspaceRoot(), env: scriptEnv(spec), stdio: ["pipe", "pipe", "pipe"] });
    const timer = setTimeout(() => child.kill("SIGTERM"), spec.timeoutMs);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const limited = truncateText(stderr ? `${stdout}\n[stderr]\n${stderr}` : stdout, spec.maxOutputBytes);
      if (code === 0) resolve(toolResult(limited.text, { script: file, exitCode: code, signal, truncated: limited.truncated }));
      else reject(new Error(`Script tool exited ${code ?? signal}: ${limited.text}`));
    });
    child.stdin.end(`${JSON.stringify(input ?? {})}\n`);
  });
}

function scriptEnv(spec) {
  return { ...process.env, STRAP_ROOT: strapRoot(), STRAP_CONFIG: strapConfigRoot(), STRAP_GLOBAL: strapGlobalRoot(), STRAP_PROJECT: strapProjectRoot(), ...(strapSessionRoot() ? { STRAP_SESSION: strapSessionRoot() } : {}), STRAP_WORK: strapWorkRoot(), STRAP_TOOL_NAME: spec.name, STRAP_WORKSPACE: workspaceRoot() };
}

export function scriptTools() {
  const names = new Set();
  return discover().flatMap((file) => {
    const spec = specFor(file);
    if (names.has(spec.name)) return [];
    names.add(spec.name);
    return [{ name: spec.name, execute: (input) => runScript(file, input, spec) }];
  });
}
