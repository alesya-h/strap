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
  return strapGlobalRoot();
}

export function strapGlobalRoot() {
  if (process.env.STRAP_GLOBAL) return path.resolve(process.env.STRAP_GLOBAL);
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(xdg, "strap");
}

export function strapRepoConfigRoot() {
  return path.join(strapRoot(), "config", "strap");
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

export function strapSessionRoot() {
  if (process.env.STRAP_SESSION) return path.resolve(process.env.STRAP_SESSION);
  return undefined;
}

export function strapSessionOverlayRoot() {
  const session = strapSessionRoot();
  return session ? path.join(session, "overlay") : undefined;
}

export function strapActiveWorkRoot() {
  return strapSessionOverlayRoot() || strapWorkRoot();
}

function maybeJoin(root, name) {
  return root ? [path.join(root, name)] : [];
}

export function strapCommandDirs() {
  const configured = (process.env.STRAP_COMMAND_PATH || "").split(path.delimiter).filter(Boolean);
  return [
    ...configured,
    ...maybeJoin(strapSessionOverlayRoot(), "commands"),
    path.join(strapWorkRoot(), "commands"),
    path.join(strapProjectRoot(), "commands"),
    path.join(strapGlobalRoot(), "commands"),
    path.join(strapRoot(), "subprojects", "cli", "commands"),
  ];
}

export function strapToolDirs() {
  const configured = (process.env.STRAP_SCRIPT_TOOLS || "").split(path.delimiter).filter(Boolean);
  return [
    ...configured,
    ...maybeJoin(strapSessionOverlayRoot(), "tools"),
    path.join(strapWorkRoot(), "tools"),
    path.join(strapProjectRoot(), "tools"),
    path.join(strapGlobalRoot(), "tools"),
    path.join(strapRoot(), "tools"),
  ];
}

export function strapPorcelainDirs() {
  const configured = (process.env.STRAP_PORCELAIN_PATH || "").split(path.delimiter).filter(Boolean);
  return [
    ...configured,
    ...maybeJoin(strapSessionOverlayRoot(), "porcelain"),
    path.join(strapWorkRoot(), "porcelain"),
    path.join(strapProjectRoot(), "porcelain"),
    path.join(strapGlobalRoot(), "porcelain"),
    path.join(strapRoot(), "porcelain"),
  ];
}

export function strapAgentDirs() {
  const configured = (process.env.STRAP_AGENT_PATH || "").split(path.delimiter).filter(Boolean);
  return [
    ...configured,
    ...maybeJoin(strapSessionOverlayRoot(), "agents"),
    path.join(strapWorkRoot(), "agents"),
    path.join(strapProjectRoot(), "agents"),
    path.join(strapGlobalRoot(), "agents"),
    path.join(strapRoot(), "agents"),
  ];
}

export function strapSkillDirs() {
  const configured = (process.env.STRAP_SKILL_PATH || "").split(path.delimiter).filter(Boolean);
  return [
    ...configured,
    ...maybeJoin(strapSessionOverlayRoot(), "skills"),
    path.join(strapWorkRoot(), "skills"),
    path.join(strapProjectRoot(), "skills"),
    path.join(strapGlobalRoot(), "skills"),
    path.join(strapRoot(), "skills"),
  ];
}

export function strapModelDirs() {
  const configured = (process.env.STRAP_MODEL_PATH || "").split(path.delimiter).filter(Boolean);
  return [
    ...configured,
    ...maybeJoin(strapSessionOverlayRoot(), "models"),
    path.join(strapWorkRoot(), "models"),
    path.join(strapProjectRoot(), "models"),
    path.join(strapGlobalRoot(), "models"),
    path.join(strapRepoConfigRoot(), "models"),
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
