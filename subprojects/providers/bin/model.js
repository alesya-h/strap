#!/usr/bin/env node
import { hasFlag, takeOption, writeJson } from "#strap/core/cli-io";
import { forkModel, listModelConfigs, loadModelConfig, modelRoots, useModel } from "#strap/providers/config";

const [command, ...args] = process.argv.slice(2);

function usage() {
  console.error("Usage: strap model <list|show|current|use|fork|roots> [args]");
  process.exit(2);
}

if (!command) usage();

if (command === "list") {
  writeJson(await listModelConfigs({ includePaths: hasFlag(args, "--paths") }));
} else if (command === "show") {
  const name = args[0] || "current";
  writeJson(await loadModelConfig(name));
} else if (command === "current") {
  writeJson(await loadModelConfig("current"));
} else if (command === "use") {
  const name = args[0];
  if (!name) usage();
  writeJson(await useModel(name));
} else if (command === "fork") {
  const [source, target] = args;
  const modelId = takeOption(args, "--set-model-id", "");
  if (!source || !target) usage();
  writeJson(await forkModel(source, target, { modelId }));
} else if (command === "roots") {
  writeJson(modelRoots());
} else {
  usage();
}
