import path from "node:path";

export function workspaceRoot() {
  return path.resolve(process.env.STRAP_WORKSPACE || process.cwd());
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
