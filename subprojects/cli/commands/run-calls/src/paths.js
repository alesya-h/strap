import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export function workspaceRoot() {
  return path.resolve(process.env.STRAP_WORKSPACE || process.cwd());
}

export function strapRoot() {
  return path.resolve(process.env.STRAP_ROOT || path.resolve(new URL(import.meta.url).pathname, "../../../../.."));
}

export function strapGlobalRoot() {
  if (process.env.STRAP_GLOBAL) return path.resolve(process.env.STRAP_GLOBAL);
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "strap");
}

export function strapConfigRoot() {
  if (process.env.STRAP_CONFIG) return path.resolve(process.env.STRAP_CONFIG);
  const repo = path.join(strapRoot(), "config", "strap");
  return fs.existsSync(repo) ? repo : strapGlobalRoot();
}

function nearest(name, start = workspaceRoot()) {
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
  return nearest(".strap") || path.join(workspaceRoot(), ".strap");
}

export function strapWorkRoot() {
  if (process.env.STRAP_WORK) return path.resolve(process.env.STRAP_WORK);
  return nearest(".strap-user") || path.join(workspaceRoot(), ".strap-user");
}

export function strapSessionRoot() {
  return process.env.STRAP_SESSION ? path.resolve(process.env.STRAP_SESSION) : undefined;
}

function maybeJoin(root, name) {
  return root ? [path.join(root, name)] : [];
}

export function strapToolDirs() {
  const configured = (process.env.STRAP_SCRIPT_TOOLS || "").split(path.delimiter).filter(Boolean);
  return [
    ...configured,
    ...maybeJoin(strapSessionRoot() ? path.join(strapSessionRoot(), "overlay") : undefined, "tools"),
    path.join(strapWorkRoot(), "tools"),
    path.join(strapProjectRoot(), "tools"),
    path.join(strapGlobalRoot(), "tools"),
    path.join(strapRoot(), "tools"),
  ];
}

export function resolveInWorkspace(inputPath, root = workspaceRoot()) {
  const resolved = path.resolve(root, inputPath || ".");
  if (process.env.STRAP_ALLOW_OUTSIDE_WORKSPACE === "1") return resolved;
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Path is outside workspace: ${inputPath}`);
  return resolved;
}

export function displayPath(filePath, root = workspaceRoot()) {
  const relative = path.relative(root, filePath);
  return relative && !relative.startsWith("..") ? relative : filePath;
}
