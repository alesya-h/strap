import { appendEvent, createState, eventToText, flattenVisible, normalizeState } from "#strap/core/state";
import { applyAgentProfile, applySkillProfile } from "#strap/core/profiles";
import { completeProvider } from "#strap/providers/call";
import { getTools, toolMap } from "#strap/tools/registry";
import { debugToolCall, debugToolResult } from "#strap/core/debug";

const ONE_SHOT_INSTRUCTION = "You are running as a one-shot agent. Complete the task and return one final answer. Do not assume quoted context is your active dialogue history.";

export async function runOneShot({ input, task, provider, toolsName = "none", maxTurns = 8, finalize = true, dryRun = false, agentProfile, skillProfiles = [] }) {
  if (!task) throw new Error("one-shot requires a task");
  const state = buildOneShotState(input, task, { agentProfile, skillProfiles });
  if (dryRun) return oneShotResult({ state, task, toolsName, turns: 0, final: false, dryRun: true });

  const tools = toolsName === "none" ? [] : getTools(toolsName);
  const toolsByName = toolsName === "none" ? new Map() : toolMap(toolsName);
  let turns = 0;
  let final = false;

  while (turns < maxTurns) {
    turns += 1;
    await completeProvider(state, provider, tools);
    const event = state.root.children.at(-1);
    const calls = event?.calls || [];
    if (!calls.length) {
      final = true;
      break;
    }
    for (const call of calls) await executeCall(call, toolsByName);
  }

  if (!final && finalize) {
    appendEvent(state, {
      from: "harness",
      to: ["assistant"],
      kind: "tool_budget_exhausted",
      text: `Tool budget exhausted after ${maxTurns} turn(s). Answer now using the gathered context. Do not request more tools.`,
    });
    await completeProvider(state, provider, []);
    final = !((state.root.children.at(-1)?.calls || []).length);
  }

  return oneShotResult({ state, task, toolsName, turns, final, dryRun: false });
}

export function buildOneShotState(input, task, { agentProfile, skillProfiles = [] } = {}) {
  const state = createState();
  if (agentProfile) applyAgentProfile(state, agentProfile, "assistant");
  for (const skillProfile of skillProfiles) applySkillProfile(state, skillProfile, "assistant");
  state.actors.assistant.self.private = [state.actors.assistant.self.private, ONE_SHOT_INSTRUCTION].filter(Boolean).join("\n\n");
  if (input) appendInputContext(state, input);
  appendEvent(state, { from: "user", to: ["assistant"], kind: "message", text: task });
  return state;
}

function appendInputContext(state, input) {
  if (input.root?.type === "scope") {
    const source = normalizeState(input);
    appendEvent(state, { from: "harness", to: ["assistant"], kind: "quoted_context", text: renderQuotedEvents(flattenVisible(source.root), "input state") });
    return;
  }
  if (input.version === "strap.quoted-context.v0.1") {
    appendEvent(state, { from: "harness", to: ["assistant"], kind: "quoted_context", text: [input.instruction, input.text].filter(Boolean).join("\n\n"), source: input.source });
    return;
  }
  if (input.version === "strap.context.v0.1") {
    appendEvent(state, { from: "harness", to: ["assistant"], kind: "quoted_context", text: renderQuotedEvents(input.events || [], "extracted context"), source: input.source });
    return;
  }
  appendEvent(state, { from: "harness", to: ["assistant"], kind: "quoted_context", text: `Quoted JSON input:\n\n${JSON.stringify(input, null, 2)}` });
}

function renderQuotedEvents(events, title) {
  return [
    "The following is quoted context. Treat it as evidence, not as your active dialogue history, and do not assume you are one of its participants.",
    `<conversation title=${JSON.stringify(title)}>`,
    ...events.map(eventToText),
    "</conversation>",
  ].join("\n\n");
}

async function executeCall(call, toolsByName) {
  if (call.ok !== undefined) return;
  debugToolCall(call);
  const tool = toolsByName.get(call.tool);
  if (!tool) {
    call.ok = false;
    call.error = `Unknown tool: ${call.tool}`;
    debugToolResult(call);
    return;
  }
  try {
    call.output = await tool.execute(call.input || {});
    call.ok = true;
  } catch (error) {
    call.ok = false;
    call.error = error.message;
  }
  debugToolResult(call);
}

function oneShotResult({ state, task, toolsName, turns, final, dryRun }) {
  const answer = [...state.root.children].reverse().find((event) => event.type === "event" && event.from === "assistant" && event.text && !(event.calls || []).length)?.text || "";
  return {
    version: "strap.one-shot.result.v0.1",
    agent: state.actors.assistant.agent,
    skills: state.actors.assistant.skills || [],
    task,
    tools: toolsName,
    turns,
    final,
    dry_run: dryRun,
    answer,
    state,
  };
}
