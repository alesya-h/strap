#!/usr/bin/env node
import { readStdin, writeJson } from "#strap/core/cli-io";
import { listPorcelain, resolvePorcelain, runPorcelain } from "#strap/porcelain/porcelain";

const [command, ...args] = process.argv.slice(2);

function usage() {
  console.error("Usage: strap porcelain list | strap porcelain run <module|path> <command> [json-or-string args...] < state.json");
  process.exit(2);
}

if (!command) usage();

if (command === "list") {
  writeJson(await listPorcelain());
} else if (command === "run") {
  const [moduleName, nuCommand, ...rawArgs] = args;
  if (!moduleName || !nuCommand) usage();
  const modulePath = await resolvePorcelain(moduleName);
  const inputJson = await readStdin();
  const parsedArgs = rawArgs.map(parseArg);
  process.stdout.write(await runPorcelain({ modulePath, command: nuCommand, args: parsedArgs, inputJson }));
} else {
  usage();
}

function parseArg(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
