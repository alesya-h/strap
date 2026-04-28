import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const SOURCE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SOURCE_DIR, "../../..");

export function workspaceRoot() {
  return path.resolve(process.env.STRAP_WORKSPACE || process.cwd());
}

export function strapRoot() {
  return path.resolve(process.env.STRAP_ROOT || DEFAULT_ROOT);
}

export function strapConfigRoot() {
  if (process.env.STRAP_CONFIG) return path.resolve(process.env.STRAP_CONFIG);
  const repoConfig = path.join(strapRoot(), "config", "strap");
  if (fs.existsSync(repoConfig)) return repoConfig;
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(xdg, "strap");
}

function findNearestDir(name, start = process.cwd()) {
  let current = path.resolve(start);
  while (true) {
    const candidate = path.join(current, name);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function findNearestStrapProject(start = process.cwd()) {
  return findNearestDir(".strap", start);
}

export function findNearestStrapWork(start = process.cwd()) {
  return findNearestDir(".strap-user", start);
}

export function strapProjectRoot() {
  if (process.env.STRAP_PROJECT) return path.resolve(process.env.STRAP_PROJECT);
  return findNearestStrapProject(workspaceRoot()) || path.join(workspaceRoot(), ".strap");
}

export function strapWorkRoot() {
  if (process.env.STRAP_WORK) return path.resolve(process.env.STRAP_WORK);
  return findNearestStrapWork(workspaceRoot()) || path.join(workspaceRoot(), ".strap-user");
}

export function strapCommandDirs() {
  const configured = (process.env.STRAP_COMMAND_PATH || "").split(path.delimiter).filter(Boolean);
  return [
    ...configured,
    path.join(strapWorkRoot(), "commands"),
    path.join(strapProjectRoot(), "commands"),
    path.join(strapConfigRoot(), "commands"),
    path.join(strapRoot(), "subprojects", "cli", "commands"),
  ];
}

export function strapToolDirs() {
  const configured = (process.env.STRAP_SCRIPT_TOOLS || "").split(path.delimiter).filter(Boolean);
  return [
    ...configured,
    path.join(strapWorkRoot(), "tools"),
    path.join(strapProjectRoot(), "tools"),
    path.join(strapConfigRoot(), "tools"),
    path.join(strapRoot(), "tools"),
  ];
}

export function strapPorcelainDirs() {
  const configured = (process.env.STRAP_PORCELAIN_PATH || "").split(path.delimiter).filter(Boolean);
  return [
    ...configured,
    path.join(strapWorkRoot(), "porcelain"),
    path.join(strapProjectRoot(), "porcelain"),
    path.join(strapConfigRoot(), "porcelain"),
    path.join(strapRoot(), "porcelain"),
  ];
}

export function strapAgentDirs() {
  const configured = (process.env.STRAP_AGENT_PATH || "").split(path.delimiter).filter(Boolean);
  return [
    ...configured,
    path.join(strapWorkRoot(), "agents"),
    path.join(strapProjectRoot(), "agents"),
    path.join(strapConfigRoot(), "agents"),
    path.join(strapRoot(), "agents"),
  ];
}

export function resolveInWorkspace(inputPath, root = workspaceRoot()) {
  const resolved = path.resolve(root, inputPath || ".");
  if (process.env.STRAP_ALLOW_OUTSIDE_WORKSPACE === "1") return resolved;
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path is outside workspace: ${inputPath}`);
  }
  return resolved;
}

export function displayPath(filePath, root = workspaceRoot()) {
  const relative = path.relative(root, filePath);
  return relative && !relative.startsWith("..") ? relative : filePath;
}
