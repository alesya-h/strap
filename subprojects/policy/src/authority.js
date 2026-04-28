import fs from "node:fs";
import path from "node:path";
import { resolveInWorkspace, strapConfigRoot, strapRoot, strapWorkRoot, workspaceRoot } from "#strap/core/paths";

export function loadPolicy(name = process.env.STRAP_POLICY || "default") {
  const file = path.join(strapConfigRoot(), "policies", `${name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Policy not found: ${name}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function rootForPath(filePath) {
  const resolved = path.resolve(filePath || ".");
  const roots = [
    ["root", strapRoot()],
    ["config", strapConfigRoot()],
    ["work", strapWorkRoot()],
    ["workspace", workspaceRoot()],
  ];
  for (const [name, root] of roots) {
    const relative = path.relative(root, resolved);
    if (!relative.startsWith("..") && !path.isAbsolute(relative)) return name;
  }
  return "outside";
}

export function decide({ policy = loadPolicy(), action, command, path: targetPath, annotations = {} }) {
  const rules = policy.rules || {};
  if (action === "execute") return decideExecute(policy, rules, command, annotations);
  if (action === "read" || action === "write") return decidePath(policy, rules, action, targetPath);
  return decision("deny", policy, `unknown action: ${action}`);
}

function decideExecute(policy, rules, command, annotations) {
  const commands = rules.commands || {};
  if (commands.deny?.includes(command)) return decision("deny", policy, `command denied: ${command}`);
  if (commands.allow && !commands.allow.includes("*") && !commands.allow.includes(command)) {
    return decision("deny", policy, `command not allowed: ${command}`);
  }
  if (annotations.destructive && rules.destructive === "deny") return decision("deny", policy, `destructive command denied: ${command}`);
  if (rules.execute === "sandbox") return decision("sandbox", policy, `command requires sandbox: ${command}`);
  return decision("allow", policy, `command allowed: ${command}`);
}

function decidePath(policy, rules, action, targetPath) {
  if (!targetPath) return decision("deny", policy, `${action} requires path`);
  if (action === "write") {
    try { resolveInWorkspace(targetPath); } catch (error) { return decision("deny", policy, error.message); }
  }
  const root = rootForPath(targetPath);
  const allowed = rules[`${action}_roots`] || [];
  if (allowed.includes("*") || allowed.includes(root)) return decision("allow", policy, `${action} allowed in ${root}`);
  return decision("deny", policy, `${action} denied in ${root}`);
}

function decision(decision, policy, reason) {
  return { decision, policy: policy.name, reason };
}
