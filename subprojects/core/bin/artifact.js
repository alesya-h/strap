#!/usr/bin/env node
import { writeJson } from "#strap/core/cli-io";
import { allArtifactStatus, artifactRoots, artifactTypes, discardArtifact, listArtifacts, promoteArtifact, workonArtifact } from "#strap/core/artifacts";

const [command, ...args] = process.argv.slice(2);

function usage() {
  console.error("Usage: strap artifact <types|roots|status|workon|promote|discard> [type] [name] [--paths]");
  process.exit(2);
}

function takeFlag(name) {
  const index = args.indexOf(name);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

if (!command) usage();

if (command === "types") {
  writeJson(artifactTypes());
} else if (command === "roots") {
  writeJson(artifactRoots());
} else if (command === "status") {
  const includePaths = takeFlag("--paths");
  const type = args[0];
  writeJson(type ? listArtifacts(type, { includePaths }) : allArtifactStatus({ includePaths }));
} else if (["workon", "promote", "discard"].includes(command)) {
  const includePaths = takeFlag("--paths");
  const [type, name] = args;
  if (!type || !name) usage();
  const action = { workon: workonArtifact, promote: promoteArtifact, discard: discardArtifact }[command];
  writeJson(action(type, name, { includePaths }));
} else {
  usage();
}
