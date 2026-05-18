#!/usr/bin/env nu

const one_shot_instruction = "You are running as a one-shot agent. Complete the task and return one final answer."

def append-event [state: record, event: record] {
  $state | update root.children { append ({ type: "event" } | merge $event) }
}

def build-state [task: string, agent: string, skills: list<string>] {
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
  append-event $state { from: "user", to: ["assistant"], kind: "message", text: $task }
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
    msg: "Usage: strap one-shot run <task> [--prepend-stdin|--append-stdin] [--model current|name|path.json] [--agent name] [--skill name ...] [--tools none|all|fs|process|web|agent|scripts|jsmcp] [--max-turns 8] [--dry-run]"
  }
}

export def main [command?: string, ...task_parts: string, --model: string = "current", --agent: string = "", --skill: string = "", --tools: string = "none", --max-turns: int = 8, --finalize: string = "true", --dry-run, --prepend-stdin, --append-stdin, --input-text: string = ""] {
  if ($command != "run") { usage }
  if $prepend_stdin and $append_stdin { error make { msg: "Use only one of --prepend-stdin or --append-stdin" } }
  let arg_task = ($task_parts | str join " ")
  let task = if $prepend_stdin { [$input_text $arg_task] | str join "" } else if $append_stdin { [$arg_task $input_text] | str join "" } else { $arg_task }
  if $task == "" { usage }
  let strap = ($env.STRAP_BIN? | default ($env.STRAP_ROOT | path join bin strap))
  let skills = if $skill == "" { [] } else { [$skill] }
  mut state = (build-state $task $agent $skills)
  if not $dry_run {
    $state = ($state | to json | ^$strap loop --model $model --tools $tools --max-turns $max_turns --finalize $finalize | from json)
  }
  let trace = ($state.trace? | default [])
  {
    version: "strap.one-shot.result.v0.1"
    agent: ($state.actors.assistant.agent? | default null)
    skills: ($state.actors.assistant.skills? | default [])
    task: $task
    tools: $tools
    turns: ($trace | where kind == loop-turn | where {|item| $item.data.phase == complete } | length)
    final: (($state.root.children | last | get calls? | default [] | length) == 0)
    dry_run: $dry_run
    answer: (answer-from $state)
    state: $state
  }
}
