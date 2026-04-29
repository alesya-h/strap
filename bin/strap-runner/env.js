import fs from "node:fs";
import path from "node:path";

const SOURCE = path.dirname(new URL(import.meta.url).pathname);
const DEFAULT_ROOT = path.resolve(SOURCE, "../..");

export function workspaceRoot() {
  return path.resolve(process.env.STRAP_WORKSPACE || process.cwd());
}

export function strapRoot() {
  return path.resolve(process.env.STRAP_ROOT || DEFAULT_ROOT);
}

export function strapGlobalRoot() {
  if (process.env.STRAP_GLOBAL) return path.resolve(process.env.STRAP_GLOBAL);
  return path.join(process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || "", ".config"), "strap");
}

export function strapConfigRoot() {
  if (process.env.STRAP_CONFIG) return path.resolve(process.env.STRAP_CONFIG);
  const repoConfig = path.join(strapRoot(), "config", "strap");
  if (fs.existsSync(repoConfig)) return repoConfig;
  return strapGlobalRoot();
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

export function strapProjectRoot() {
  if (process.env.STRAP_PROJECT) return path.resolve(process.env.STRAP_PROJECT);
  return findNearestDir(".strap", workspaceRoot()) || path.join(workspaceRoot(), ".strap");
}

export function strapWorkRoot() {
  if (process.env.STRAP_WORK) return path.resolve(process.env.STRAP_WORK);
  return findNearestDir(".strap-user", workspaceRoot()) || path.join(workspaceRoot(), ".strap-user");
}

export function strapSessionRoot() {
  return process.env.STRAP_SESSION ? path.resolve(process.env.STRAP_SESSION) : undefined;
}

export function envFor(name, dir) {
  return {
    ...process.env,
    STRAP_ROOT: strapRoot(),
    STRAP_CONFIG: strapConfigRoot(),
    STRAP_GLOBAL: strapGlobalRoot(),
    STRAP_PROJECT: strapProjectRoot(),
    ...(strapSessionRoot() ? { STRAP_SESSION: strapSessionRoot() } : {}),
    STRAP_WORK: strapWorkRoot(),
    STRAP_WORKSPACE: workspaceRoot(),
    STRAP_CMD_NAME: name,
    STRAP_CMD_DIR: dir,
  };
}

export function resolveSessionEnvFromPointer() {
  if (process.env.STRAP_SESSION) return;
  const current = path.join(strapWorkRoot(), "sessions", "current");
  if (!fs.existsSync(current)) return;
  const session = fs.readFileSync(current, "utf8").trim();
  if (session) process.env.STRAP_SESSION = path.resolve(session);
}
