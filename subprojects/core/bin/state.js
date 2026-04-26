#!/usr/bin/env node
import { appendEvent, collapseLastOpenScope, compileChatMessages, compileOpenAIResponses, createState, normalizeState, openScope } from "../../../src/state.js";
import { readJsonInput, takeOption, writeJson } from "../../../src/cli-io.js";

const [command, ...args] = process.argv.slice(2);

function usage() {
  console.error("Usage: strap state <init|add-user|add-assistant|push|pop|compile-chat|compile-openai|display-last-message> [args] < state.json > next.json");
  process.exit(2);
}

if (!command) usage();

async function inputState() {
  return normalizeState(await readJsonInput(takeOption(args, "--file", "-")));
}

switch (command) {
  case "init":
    writeJson(createState());
    break;
  case "add-user": {
    const state = await inputState();
    appendEvent(state, { from: "user", to: ["assistant"], kind: "message", text: args.join(" ") });
    writeJson(state);
    break;
  }
  case "add-assistant": {
    const state = await inputState();
    appendEvent(state, { from: "assistant", to: ["user"], kind: "message", text: args.join(" ") });
    writeJson(state);
    break;
  }
  case "push": {
    const state = await inputState();
    openScope(state, args.join(" ") || "scope");
    writeJson(state);
    break;
  }
  case "pop": {
    const state = await inputState();
    collapseLastOpenScope(state, args.join(" "));
    writeJson(state);
    break;
  }
  case "compile-chat":
    writeJson(compileChatMessages(await inputState()));
    break;
  case "compile-openai": {
    const modelIndex = args.indexOf("--model");
    const model = modelIndex === -1 ? "gpt-5.1" : args[modelIndex + 1];
    writeJson(compileOpenAIResponses(await inputState(), { model }));
    break;
  }
  case "display-last-message": {
    const state = await inputState();
    const events = state.root.children.filter((node) => node.type === "event");
    const last = [...events].reverse().find((event) => event.from === "assistant" && event.text);
    process.stdout.write(last?.text ? `${last.text}\n` : "");
    break;
  }
  default:
    usage();
}
