import fs from "node:fs/promises";
import path from "node:path";
import { displayPath, resolveInWorkspace } from "./paths.js";
import { toolResult } from "./result.js";

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeFile(args) {
  const filePath = resolveInWorkspace(String(args.path));
  const content = String(args.content ?? "");
  const overwrite = Boolean(args.overwrite);
  if (!overwrite && await exists(filePath)) throw new Error("File exists. Set overwrite=true to replace it.");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  return toolResult({ path: displayPath(filePath), bytes: Buffer.byteLength(content), overwritten: overwrite });
}

async function editFile(args) {
  const filePath = resolveInWorkspace(String(args.path));
  const oldText = String(args.old_text ?? "");
  const newText = String(args.new_text ?? "");
  const original = await fs.readFile(filePath, "utf8");
  const count = original.split(oldText).length - 1;
  if (count === 0) throw new Error("old_text was not found");
  if (!args.replace_all && count > 1) throw new Error("old_text occurs multiple times. Set replace_all=true or use a more specific string.");
  await fs.writeFile(filePath, args.replace_all ? original.split(oldText).join(newText) : original.replace(oldText, newText));
  return toolResult({ path: displayPath(filePath), replacements: args.replace_all ? count : 1 });
}

async function multiEditFile(args) {
  const filePath = resolveInWorkspace(String(args.path));
  let content = await fs.readFile(filePath, "utf8");
  let replacements = 0;
  for (const edit of args.edits || []) {
    const oldText = String(edit.old_text ?? "");
    const count = content.split(oldText).length - 1;
    if (count === 0) throw new Error(`old_text was not found for edit ${replacements + 1}`);
    if (!edit.replace_all && count > 1) throw new Error(`old_text occurs multiple times for edit ${replacements + 1}`);
    content = edit.replace_all ? content.split(oldText).join(String(edit.new_text ?? "")) : content.replace(oldText, String(edit.new_text ?? ""));
    replacements += edit.replace_all ? count : 1;
  }
  await fs.writeFile(filePath, content);
  return toolResult({ path: displayPath(filePath), replacements });
}

export function fsWriteTools() {
  return [
    { name: "write_file", execute: writeFile },
    { name: "edit_file", execute: editFile },
    { name: "multi_edit_file", execute: multiEditFile },
  ];
}
