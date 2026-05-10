#!/usr/bin/env nu

def strap-bin [] { $env.STRAP_BIN? | default ($env.STRAP_ROOT | path join bin strap) }

def complete-once [model: string, tools: string] {
  $in | to json | run-external (strap-bin) llm complete "--model" $model "--tools" $tools | from json
}

def process-tools-once [tools: string] {
  $in | to json | run-external (strap-bin) run-calls "--tools" $tools | from json
}

def last-event [] {
  let children = ($in.root.children? | default [])
  if (($children | length) == 0) { null } else { $children | last }
}

def last-calls [] {
  let event = ($in | last-event)
  if ($event == null) { [] } else { $event.calls? | default [] }
}

def has-tool-calls [] { (($in | last-calls | length) > 0) }

def add-trace [kind: string, data: any] {
  let state = $in
  let trace = { at: (date now | into string), kind: $kind, data: $data }
  if ("trace" in ($state | columns)) { $state | update trace { append $trace } } else { $state | insert trace [$trace] }
}

def add-budget-exhausted [turns: int] {
  let event = {
    type: "event"
    from: "harness"
    to: [assistant]
    kind: "tool_budget_exhausted"
    text: $"Tool budget exhausted after ($turns) turn\(s\). Answer now using the gathered context. Do not request more tools."
  }
  $in | update root.children { append $event }
}

def add-tool-budget-exhausted [calls: int] {
  let event = {
    type: "event"
    from: "harness"
    to: [assistant]
    kind: "tool_budget_exhausted"
    text: $"Tool call budget exhausted after ($calls) requested call\(s\). Answer now using the gathered context. Do not request more tools."
  }
  $in | update root.children { append $event }
}

def run-loop [model: string, tools: string, max_turns: int, finalize: bool, max_tool_calls: int] {
  mut state = $in
  mut final = false
  mut tool_calls = 0
  mut turn = 0
  while $turn < $max_turns {
    $turn = $turn + 1
    $state = ($state | complete-once $model $tools)
    let calls = ($state | last-calls | length)
    $tool_calls = ($tool_calls + $calls)
    $state = ($state | add-trace loop-turn { turn: $turn, calls: $calls, phase: complete })
    if not ($state | has-tool-calls) { $final = true; break }
    if ($tool_calls > $max_tool_calls) { $state = ($state | add-tool-budget-exhausted $tool_calls); break }
    $state = ($state | process-tools-once $tools)
    $state = ($state | add-trace loop-turn { turn: $turn, calls: $calls, phase: tools })
  }
  if (not $final) and $finalize { $state = ($state | add-budget-exhausted $max_turns | complete-once $model none) }
  $state
}

export def main [--model: string = "current", --tools: string = "all", --max-turns: int = 8, --no-finalize, --finalize: any = "true", --max-tool-calls: int = 64] {
  $in | run-loop $model $tools $max_turns ((not $no_finalize) and (($finalize | into string) != "false")) $max_tool_calls
}
