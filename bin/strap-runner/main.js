import fs from "node:fs";
import path from "node:path";
import { commandDir, prettyCommands } from "./commands.js";
import { runExecutable } from "./execute.js";
import { resolveSessionEnvFromPointer } from "./env.js";
import { resolveSession } from "./session.js";

function die(message) {
  process.stderr.write(`${message}\n`);
  process.exit(255);
}

function showHelp(name) {
  if (!name) die("Usage: strap help <command>");
  const dir = commandDir(name);
  if (!dir) die(`Unknown command: ${name}`);
  const file = path.join(dir, "desc");
  if (!fs.existsSync(file)) die(`No help found for command: ${name}`);
  process.stdout.write(`Showing help for: ${name}\n\n${fs.readFileSync(file, "utf8")}`);
}

async function runCommand(name, args) {
  const dir = commandDir(name);
  if (!dir) die(`Unknown command: ${name}`);
  await runExecutable(path.join(dir, "run"), name, dir, args, die);
}

async function runInner(args) {
  const [name, script, ...rest] = args;
  if (!name || !script) die("Usage: strap inner <command> <script> [args...]");
  const dir = commandDir(name);
  if (!dir) die(`Unknown command: ${name}`);
  const file = path.join(dir, "inner", script);
  if (!fs.existsSync(file)) die(`Inner script not found: ${file}`);
  await runExecutable(file, name, dir, rest, die);
}

async function runWithSession(args) {
  const [session, separatorOrCommand, ...rest] = args;
  if (!session || !separatorOrCommand) die("Usage: strap with-session <session> [--] <command> [args...]");
  const commandArgs = separatorOrCommand === "--" ? rest : [separatorOrCommand, ...rest];
  if (!commandArgs.length) die("Usage: strap with-session <session> [--] <command> [args...]");
  process.env.STRAP_SESSION = resolveSession(session, die);
  const [nextCommand, ...nextArgs] = commandArgs;
  await runCommand(nextCommand, nextArgs);
}

export async function main(argv) {
  resolveSessionEnvFromPointer();
  const [command, ...args] = argv;
  if (!command || command === "-h" || command === "--help") return prettyCommands(false);
  if (command === "-a") return prettyCommands(true);
  if (command === "help") return showHelp(args[0]);
  if (command === "command-dir") {
    const dir = commandDir(args[0]);
    if (!dir) die(`Unknown command: ${args[0]}`);
    return process.stdout.write(`${dir}\n`);
  }
  if (command === "inner") return runInner(args);
  if (command === "with-session") return runWithSession(args);
  return runCommand(command, args);
}
