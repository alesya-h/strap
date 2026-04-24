import fs from "node:fs/promises";

export async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

export async function readJsonInput(filePath = "-") {
  const text = filePath && filePath !== "-" ? await fs.readFile(filePath, "utf8") : await readStdin();
  if (!text.trim()) throw new Error("Expected JSON state on stdin");
  return JSON.parse(text);
}

export function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function takeOption(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  args.splice(index, value === undefined ? 1 : 2);
  return value === undefined ? fallback : value;
}

export function hasFlag(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}
