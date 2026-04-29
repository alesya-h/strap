import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { displayPath, resolveInWorkspace, workspaceRoot } from "./paths.js";
import { toolResult } from "./result.js";

const execFileAsync = promisify(execFile);

function lineWindow(text, offset = 1, limit = 2000) {
  const lines = text.split("\n");
  const start = Math.max(1, Number(offset));
  const end = Math.min(lines.length, start + Math.max(1, Number(limit)) - 1);
  const rendered = [];
  for (let index = start; index <= end; index += 1) {
    const raw = lines[index - 1] ?? "";
    rendered.push(`${index}: ${raw.length > 2000 ? `${raw.slice(0, 2000)}[line truncated]` : raw}`);
  }
  return { rendered: rendered.join("\n"), totalLines: lines.length, shown: [start, end] };
}

async function readFileOrDirectory(args) {
  const filePath = resolveInWorkspace(String(args.path));
  const stat = await fs.stat(filePath);
  if (stat.isDirectory()) {
    const entries = await fs.readdir(filePath, { withFileTypes: true });
    const output = entries.sort((a, b) => a.name.localeCompare(b.name)).map((entry) => `${entry.name}${entry.isDirectory() ? "/" : ""}`).join("\n");
    return toolResult(`<path>${displayPath(filePath)}</path>\n<type>directory</type>\n<entries>\n${output}\n</entries>`);
  }
  const window = lineWindow(await fs.readFile(filePath, "utf8"), args.offset || 1, args.limit || 2000);
  return toolResult(`<path>${displayPath(filePath)}</path>\n<type>file</type>\n<content>\n${window.rendered}\n</content>`, window);
}

async function listDir(args) {
  const dir = resolveInWorkspace(args.path || ".");
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return toolResult(entries.sort((a, b) => a.name.localeCompare(b.name)).map((entry) => ({
    name: entry.name,
    path: displayPath(path.join(dir, entry.name)),
    type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
  })));
}

async function globFiles(args) {
  const root = workspaceRoot();
  const cwd = resolveInWorkspace(args.path || ".", root);
  const { stdout } = await execFileAsync("rg", ["--files", "-g", String(args.pattern)], { cwd, maxBuffer: 16 * 1024 * 1024 });
  const all = stdout.split("\n").filter(Boolean);
  const files = all.slice(0, Number(args.limit || 2000)).map((entry) => displayPath(path.resolve(cwd, entry), root));
  return toolResult(files, { truncated: all.length > files.length });
}

async function grepFiles(args) {
  const root = workspaceRoot();
  const cwd = resolveInWorkspace(args.path || ".", root);
  const rgArgs = ["--line-number", "--color", "never"];
  if (Number(args.context || 0) > 0) rgArgs.push("--context", String(args.context));
  if (args.include) rgArgs.push("-g", String(args.include));
  rgArgs.push(String(args.pattern));
  try {
    const { stdout } = await execFileAsync("rg", rgArgs, { cwd, maxBuffer: 16 * 1024 * 1024 });
    const lines = stdout.split("\n").filter(Boolean);
    const shown = lines.slice(0, Number(args.limit || 2000));
    return toolResult(shown.map((line) => line.replace(/^([^:]+)/, (m) => displayPath(path.resolve(cwd, m), root))).join("\n") || "No matches", { matchesShown: shown.length, truncated: lines.length > shown.length });
  } catch (error) {
    if (error.code === 1) return toolResult("No matches", { matchesShown: 0 });
    throw error;
  }
}

export function fsReadTools() {
  return [
    { name: "read_file", execute: readFileOrDirectory },
    { name: "list_dir", execute: listDir },
    { name: "glob_files", execute: globFiles },
    { name: "grep_files", execute: grepFiles },
  ];
}
