import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { strapConfigRoot, strapRoot, strapToolDirs, strapWorkRoot, workspaceRoot } from "./paths.js";
import { toolResult, truncateText } from "./result.js";

const DEFAULT_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: true,
};

function scriptToolDirs() {
  return strapToolDirs();
}

function safeName(fileName) {
  return path.basename(fileName).replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]/g, "_");
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return undefined;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isExecutable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function discoverScriptFiles() {
  const seen = new Set();
  const files = [];
  for (const dir of scriptToolDirs()) {
    const resolvedDir = path.resolve(dir);
    if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) continue;
    for (const entry of fs.readdirSync(resolvedDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (entry.name.endsWith(".json")) continue;
      const filePath = path.join(resolvedDir, entry.name);
      if (!isExecutable(filePath)) continue;
      if (seen.has(filePath)) continue;
      seen.add(filePath);
      files.push(filePath);
    }
  }
  return files;
}

function loadSpec(filePath) {
  const sidecar = readJsonIfExists(`${filePath}.json`) || readJsonIfExists(filePath.replace(/\.[^.]+$/, ".json"));
  if (sidecar) return sidecar;
  return {
    name: safeName(filePath),
    description: `Run script tool ${path.basename(filePath)}. It receives JSON input on stdin and writes output to stdout.`,
    inputSchema: DEFAULT_SCHEMA,
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  };
}

function normalizeSpec(spec, filePath) {
  return {
    name: spec.name || safeName(filePath),
    description: spec.description || `Run script tool ${path.basename(filePath)}.`,
    inputSchema: spec.inputSchema || spec.input_schema || spec.parameters || DEFAULT_SCHEMA,
    readOnly: Boolean(spec.readOnly ?? spec.read_only ?? spec.annotations?.readOnlyHint),
    destructive: Boolean(spec.destructive ?? spec.annotations?.destructiveHint),
    openWorld: Boolean(spec.openWorld ?? spec.open_world ?? spec.annotations?.openWorldHint),
    timeoutMs: Number(spec.timeoutMs || spec.timeout_ms || 120000),
    maxOutputBytes: Number(spec.maxOutputBytes || spec.max_output_bytes || 60000),
  };
}

function runScript(filePath, input, spec) {
  return new Promise((resolve, reject) => {
    const child = spawn(filePath, [], {
      cwd: workspaceRoot(),
      env: {
        ...process.env,
        STRAP_ROOT: strapRoot(),
        STRAP_CONFIG: strapConfigRoot(),
        STRAP_WORK: strapWorkRoot(),
        STRAP_TOOL_NAME: spec.name,
        STRAP_WORKSPACE: workspaceRoot(),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, spec.timeoutMs);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const output = stderr ? `${stdout}\n[stderr]\n${stderr}` : stdout;
      const limited = truncateText(output, spec.maxOutputBytes);
      if (code === 0) {
        resolve(toolResult(limited.text, { script: filePath, exitCode: code, signal, truncated: limited.truncated }));
      } else {
        reject(new Error(`Script tool exited ${code ?? signal}: ${limited.text}`));
      }
    });
    child.stdin.end(`${JSON.stringify(input ?? {})}\n`);
  });
}

export function scriptTools() {
  return discoverScriptFiles().map((filePath) => {
    const spec = normalizeSpec(loadSpec(filePath), filePath);
    return {
      name: spec.name,
      description: spec.description,
      inputSchema: spec.inputSchema,
      readOnly: spec.readOnly,
      destructive: spec.destructive,
      openWorld: spec.openWorld,
      execute: (input) => runScript(filePath, input, spec),
    };
  });
}
