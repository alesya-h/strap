#!/usr/bin/env nu

use lib/context.nu

const one_shot_instruction = "You are running as a one-shot agent. Complete the task and return one final answer. Do not assume quoted context is your active dialogue history."

def build-state [input: any, has_input: bool, task: string, agent: string, skills: list<string>] {
  let strap = ($env.STRAP_BIN? | default ($env.STRAP_ROOT | path join bin strap))
  mut state = (^$strap state init | from json)
  if $agent != "" { $state = ($state | to json | ^$strap agents apply $agent | from json) }
  for skill in $skills { $state = ($state | to json | ^$strap skills apply $skill | from json) }
  let current_private = ($state.actors.assistant.self.private? | default "")
  $state = ($state | update actors.assistant.self.private (
    [$current_private $one_shot_instruction]
    | where {|item| $item != null and $item != "" }
    | str join "\n\n"
  ))
  if $has_input { $state = ($state | context append-input-context $input) }
  $state | context append-event { from: "user", to: ["assistant"], kind: "message", text: $task }
}

def answer-from [state: record] {
  let matches = ($state.root.children | reverse | where {|event|
    let is_text_answer = (($event.text? | default "") != "") and (($event.calls? | default [] | length) == 0)
    (($event.type? | default "") == "event") and (($event.from? | default "") == "assistant") and $is_text_answer
  })
  if ($matches | is-empty) { "" } else { $matches | first | get text }
}

def usage [] {
  error make {
    msg: "Usage: strap one-shot run <task> [--model current|name|path.json] [--agent name] [--skill name ...] [--tools none|all|fs|process|web|agent|scripts|jsmcp] [--max-turns 8] [--dry-run] < context.json"
  }
}

export def main [command?: string, ...task_parts: string, --model: string = "current", --agent: string = "", --skill: string = "", --tools: string = "none", --max-turns: int = 8, --finalize: string = "true", --dry-run] {
  if ($command != "run") { usage }
  let task = ($task_parts | str join " ")
  if $task == "" { usage }
  let input = ($in | default null)
  let has_input = ($input != null)
  let strap = ($env.STRAP_BIN? | default ($env.STRAP_ROOT | path join bin strap))
  let skills = if $skill == "" { [] } else { [$skill] }
  mut state = (build-state $input $has_input $task $agent $skills)
  mut turns = 0
  mut final = false
  if not $dry_run {
    while $turns < $max_turns {
      $turns = $turns + 1
      $state = ($state | to json | ^$strap llm complete --model $model --tools $tools | from json)
      let last = ($state.root.children | last)
      if (($last.calls? | default [] | length) == 0) { $final = true; break }
      $state = ($state | to json | ^$strap run-calls --tools $tools | from json)
    }
    if (not $final) and ($finalize != "false") {
      $state = ($state | context append-event {
        from: "harness"
        to: ["assistant"]
        kind: "tool_budget_exhausted"
        text: $"Tool budget exhausted after ($max_turns) turn(s). Answer now using the gathered context. Do not request more tools."
      })
      $state = ($state | to json | ^$strap llm complete --model $model --tools none | from json)
      let last = ($state.root.children | last)
      $final = (($last.calls? | default [] | length) == 0)
    }
  }
  {
    version: "strap.one-shot.result.v0.1"
    agent: ($state.actors.assistant.agent? | default null)
    skills: ($state.actors.assistant.skills? | default [])
    task: $task
    tools: $tools
    turns: $turns
    final: $final
    dry_run: $dry_run
    answer: (answer-from $state)
    state: $state
  }
}
