import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { displayPath, resolveInWorkspace, workspaceRoot } from "./paths.js";
import { toolResult, truncateText } from "./result.js";
import {
  arraySchema,
  booleanSchema,
  integerSchema,
  objectSchema,
  optionalArray,
  optionalBoolean,
  optionalInteger,
  optionalString,
  requireString,
  stringSchema,
} from "./schemas.js";

const execFileAsync = promisify(execFile);

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function lineWindow(text, offset = 1, limit = 2000) {
  const lines = text.split("\n");
  const start = Math.max(1, offset);
  const end = Math.min(lines.length, start + Math.max(1, limit) - 1);
  const rendered = [];
  for (let index = start; index <= end; index += 1) {
    const raw = lines[index - 1] ?? "";
    const line = raw.length > 2000 ? `${raw.slice(0, 2000)}[line truncated]` : raw;
    rendered.push(`${index}: ${line}`);
  }
  return { rendered: rendered.join("\n"), totalLines: lines.length, shown: [start, end] };
}

async function readFileOrDirectory(args) {
  const filePath = resolveInWorkspace(requireString(args, "path"));
  const stat = await fs.stat(filePath);
  if (stat.isDirectory()) {
    const entries = await fs.readdir(filePath, { withFileTypes: true });
    const output = entries
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => `${entry.name}${entry.isDirectory() ? "/" : ""}`)
      .join("\n");
    return toolResult(`<path>${displayPath(filePath)}</path>\n<type>directory</type>\n<entries>\n${output}\n</entries>`);
  }
  const offset = optionalInteger(args, "offset", 1);
  const limit = optionalInteger(args, "limit", 2000);
  const text = await fs.readFile(filePath, "utf8");
  const window = lineWindow(text, offset, limit);
  return toolResult(`<path>${displayPath(filePath)}</path>\n<type>file</type>\n<content>\n${window.rendered}\n</content>`, {
    totalLines: window.totalLines,
    shown: window.shown,
  });
}

async function listDir(args) {
  const dir = resolveInWorkspace(optionalString(args, "path", "."));
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return toolResult(entries.sort((a, b) => a.name.localeCompare(b.name)).map((entry) => ({
    name: entry.name,
    path: displayPath(path.join(dir, entry.name)),
    type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
  })));
}

async function writeFile(args) {
  const filePath = resolveInWorkspace(requireString(args, "path"));
  const content = String(args.content ?? "");
  const overwrite = optionalBoolean(args, "overwrite", false);
  if (!overwrite && await pathExists(filePath)) {
    throw new Error("File exists. Set overwrite=true to replace it.");
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  return toolResult({ path: displayPath(filePath), bytes: Buffer.byteLength(content), overwritten: overwrite });
}

async function editFile(args) {
  const filePath = resolveInWorkspace(requireString(args, "path"));
  const oldText = requireString(args, "old_text");
  const newText = String(args.new_text ?? "");
  const replaceAll = optionalBoolean(args, "replace_all", false);
  const original = await fs.readFile(filePath, "utf8");
  const first = original.indexOf(oldText);
  if (first === -1) throw new Error("old_text was not found");
  if (!replaceAll && original.indexOf(oldText, first + oldText.length) !== -1) {
    throw new Error("old_text occurs multiple times. Set replace_all=true or use a more specific string.");
  }
  const updated = replaceAll ? original.split(oldText).join(newText) : original.replace(oldText, newText);
  await fs.writeFile(filePath, updated);
  return toolResult({ path: displayPath(filePath), replacements: replaceAll ? original.split(oldText).length - 1 : 1 });
}

async function multiEditFile(args) {
  const filePath = resolveInWorkspace(requireString(args, "path"));
  const edits = optionalArray(args, "edits");
  let content = await fs.readFile(filePath, "utf8");
  let replacements = 0;
  for (const edit of edits) {
    const oldText = requireString(edit, "old_text");
    const newText = String(edit.new_text ?? "");
    const replaceAll = optionalBoolean(edit, "replace_all", false);
    const count = content.split(oldText).length - 1;
    if (count === 0) throw new Error(`old_text was not found for edit ${replacements + 1}`);
    if (!replaceAll && count > 1) throw new Error(`old_text occurs multiple times for edit ${replacements + 1}`);
    content = replaceAll ? content.split(oldText).join(newText) : content.replace(oldText, newText);
    replacements += replaceAll ? count : 1;
  }
  await fs.writeFile(filePath, content);
  return toolResult({ path: displayPath(filePath), replacements });
}

async function globFiles(args) {
  const root = workspaceRoot();
  const cwd = resolveInWorkspace(optionalString(args, "path", "."), root);
  const pattern = requireString(args, "pattern");
  const limit = optionalInteger(args, "limit", 2000);
  const { stdout } = await execFileAsync("rg", ["--files", "-g", pattern], { cwd, maxBuffer: 16 * 1024 * 1024 });
  const files = stdout.split("\n").filter(Boolean).slice(0, limit).map((entry) => displayPath(path.resolve(cwd, entry), root));
  return toolResult(files, { truncated: stdout.split("\n").filter(Boolean).length > files.length });
}

async function grepFiles(args) {
  const root = workspaceRoot();
  const cwd = resolveInWorkspace(optionalString(args, "path", "."), root);
  const pattern = requireString(args, "pattern");
  const include = optionalString(args, "include");
  const context = optionalInteger(args, "context", 0);
  const limit = optionalInteger(args, "limit", 2000);
  const rgArgs = ["--line-number", "--color", "never"];
  if (context > 0) rgArgs.push("--context", String(context));
  if (include) rgArgs.push("-g", include);
  rgArgs.push(pattern);
  try {
    const { stdout } = await execFileAsync("rg", rgArgs, { cwd, maxBuffer: 16 * 1024 * 1024 });
    const lines = stdout.split("\n").filter(Boolean);
    const shown = lines.slice(0, limit);
    const text = shown.map((line) => {
      const colon = line.indexOf(":");
      if (colon === -1) return line;
      return `${displayPath(path.resolve(cwd, line.slice(0, colon)), root)}${line.slice(colon)}`;
    }).join("\n");
    return toolResult(text || "No matches", { matchesShown: shown.length, truncated: lines.length > shown.length });
  } catch (error) {
    if (error.code === 1) return toolResult("No matches", { matchesShown: 0 });
    throw error;
  }
}

export function fsTools() {
  return [
    {
      name: "read_file",
      description: "Read a workspace file or directory. File output includes line numbers and supports offset/limit pagination.",
      inputSchema: objectSchema({
        path: stringSchema("Workspace-relative path to read"),
        offset: integerSchema("1-based starting line for files", { minimum: 1 }),
        limit: integerSchema("Maximum file lines to return", { minimum: 1 }),
      }, ["path"]),
      readOnly: true,
      execute: readFileOrDirectory,
    },
    {
      name: "list_dir",
      description: "List direct children of a workspace directory.",
      inputSchema: objectSchema({ path: stringSchema("Workspace-relative directory path") }, []),
      readOnly: true,
      execute: listDir,
    },
    {
      name: "glob_files",
      description: "Find workspace files with ripgrep glob syntax. Prefer this for file discovery.",
      inputSchema: objectSchema({
        pattern: stringSchema("Glob pattern, for example **/*.js"),
        path: stringSchema("Directory to search from"),
        limit: integerSchema("Maximum results", { minimum: 1 }),
      }, ["pattern"]),
      readOnly: true,
      execute: globFiles,
    },
    {
      name: "grep_files",
      description: "Search workspace file contents with ripgrep regex syntax.",
      inputSchema: objectSchema({
        pattern: stringSchema("Regular expression to search for"),
        path: stringSchema("Directory to search from"),
        include: stringSchema("Optional file glob filter, for example *.js"),
        context: integerSchema("Context lines before and after matches", { minimum: 0 }),
        limit: integerSchema("Maximum result lines", { minimum: 1 }),
      }, ["pattern"]),
      readOnly: true,
      execute: grepFiles,
    },
    {
      name: "write_file",
      description: "Create or replace a workspace file. Existing files require overwrite=true.",
      inputSchema: objectSchema({
        path: stringSchema("Workspace-relative file path"),
        content: stringSchema("Complete file contents"),
        overwrite: booleanSchema("Whether an existing file may be replaced"),
      }, ["path", "content"]),
      readOnly: false,
      destructive: true,
      execute: writeFile,
    },
    {
      name: "edit_file",
      description: "Edit a file by exact string replacement. Use a uniquely identifying old_text unless replace_all=true.",
      inputSchema: objectSchema({
        path: stringSchema("Workspace-relative file path"),
        old_text: stringSchema("Exact text to replace"),
        new_text: stringSchema("Replacement text"),
        replace_all: booleanSchema("Replace all occurrences instead of requiring a unique match"),
      }, ["path", "old_text", "new_text"]),
      readOnly: false,
      destructive: true,
      execute: editFile,
    },
    {
      name: "multi_edit_file",
      description: "Apply a sequence of exact string replacements to one file.",
      inputSchema: objectSchema({
        path: stringSchema("Workspace-relative file path"),
        edits: arraySchema("Sequential edits", objectSchema({
          old_text: stringSchema("Exact text to replace"),
          new_text: stringSchema("Replacement text"),
          replace_all: booleanSchema("Replace all occurrences"),
        }, ["old_text", "new_text"])),
      }, ["path", "edits"]),
      readOnly: false,
      destructive: true,
      execute: multiEditFile,
    },
  ];
}
