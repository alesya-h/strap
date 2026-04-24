#!/usr/bin/env node
import { appendEvent, collapseLastOpenScope, compileChatMessages, compileOpenAIResponses, createState, normalizeState, readState, writeState } from "../src/state.js";

const [command, statePath, ...args] = process.argv.slice(2);

function usage() {
  console.error("Usage: strap-state <init|add-user|add-assistant|push|pop|compile-chat|compile-openai> <state.json> [args]");
  process.exit(2);
}

if (!command || !statePath) usage();

switch (command) {
  case "init":
    await writeState(statePath, createState());
    break;
  case "add-user": {
    const state = normalizeState(await readState(statePath));
    appendEvent(state, { from: "user", to: ["assistant"], kind: "message", text: args.join(" ") });
    await writeState(statePath, state);
    break;
  }
  case "add-assistant": {
    const state = normalizeState(await readState(statePath));
    appendEvent(state, { from: "assistant", to: ["user"], kind: "message", text: args.join(" ") });
    await writeState(statePath, state);
    break;
  }
  case "push": {
    const state = normalizeState(await readState(statePath));
    state.root.children.push({ type: "scope", label: args.join(" ") || "scope", status: "open", participants: ["assistant", "harness"], children: [] });
    await writeState(statePath, state);
    break;
  }
  case "pop": {
    const state = normalizeState(await readState(statePath));
    collapseLastOpenScope(state, args.join(" "));
    await writeState(statePath, state);
    break;
  }
  case "compile-chat":
    console.log(JSON.stringify(compileChatMessages(await readState(statePath)), null, 2));
    break;
  case "compile-openai": {
    const modelIndex = args.indexOf("--model");
    const model = modelIndex === -1 ? "gpt-5.1" : args[modelIndex + 1];
    console.log(JSON.stringify(compileOpenAIResponses(await readState(statePath), { model }), null, 2));
    break;
  }
  default:
    usage();
}
