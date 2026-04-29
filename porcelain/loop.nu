use ../nu/plumbing.nu *

# A first porcelain sketch for agent loops. It delegates provider/tool effects
# to Node filters and keeps the flow as immutable state pipes.

def root-file [path_parts: list<string>] {
  let root = ($env.STRAP_ROOT? | default (pwd))
  $path_parts | prepend $root | path join
}

export def complete-once [--model: string = "current", --tools: string = "all"] {
  $in | to json | ^node (root-file [subprojects providers bin llm.js]) complete --model $model --tools $tools | from json
}

export def process-tools-once [--tools: string = "all"] {
  $in | to json | ^(root-file [bin strap]) run-calls --tools $tools | from json
}

export def complete-and-process [--model: string = "current", --tools: string = "all"] {
  $in | complete-once --model $model --tools $tools | process-tools-once --tools $tools
}

export def last-event [] {
  let state = $in
  let children = ($state.root.children? | default [])
  if (($children | length) == 0) { null } else { $children | last }
}

export def last-calls [] {
  let event = ($in | last-event)
  if ($event == null) { [] } else { $event.calls? | default [] }
}

export def has-tool-calls [] {
  (($in | last-calls | length) > 0)
}

export def add-budget-exhausted [turns: int] {
  let state = $in
  let event = {
    type: "event"
    from: "harness"
    to: [assistant]
    kind: "tool_budget_exhausted"
    text: $"Tool budget exhausted after ($turns) turn\(s\). Answer now using the gathered context. Do not request more tools."
  }
  $state | update root.children { append $event }
}

export def add-tool-budget-exhausted [calls: int] {
  let state = $in
  let event = {
    type: "event"
    from: "harness"
    to: [assistant]
    kind: "tool_budget_exhausted"
    text: $"Tool call budget exhausted after ($calls) requested call\(s\). Answer now using the gathered context. Do not request more tools."
  }
  $state | update root.children { append $event }
}

export def trace-turn [turn: int, calls: int, phase: string] {
  $in | add-trace loop-turn { turn: $turn, calls: $calls, phase: $phase }
}

export def run-model [model: string = "current", tools: string = "all", max_turns: int = 8, finalize: bool = true, max_tool_calls: int = 64] {
  mut state = $in
  mut final = false
  mut tool_calls = 0
  for turn in 1..$max_turns {
    $state = ($state | complete-once --model $model --tools $tools)
    let calls = ($state | last-calls | length)
    $tool_calls = ($tool_calls + $calls)
    $state = ($state | trace-turn $turn $calls complete)
    if not ($state | has-tool-calls) {
      $final = true
      break
    }
    if ($tool_calls > $max_tool_calls) {
      $state = ($state | add-tool-budget-exhausted $tool_calls)
      break
    }
    $state = ($state | process-tools-once --tools $tools)
    $state = ($state | trace-turn $turn $calls tools)
  }
  if (not $final) and $finalize {
    $state = ($state | add-budget-exhausted $max_turns | complete-once --model $model --tools none)
  }
  $state
}

export def run [model: string = "current", tools: string = "all", max_turns: int = 8, finalize: bool = true, max_tool_calls: int = 64] {
  mut state = $in
  mut final = false
  mut tool_calls = 0
  for turn in 1..$max_turns {
    $state = ($state | complete-once --model $model --tools $tools)
    let calls = ($state | last-calls | length)
    $tool_calls = ($tool_calls + $calls)
    $state = ($state | trace-turn $turn $calls complete)
    if not ($state | has-tool-calls) {
      $final = true
      break
    }
    if ($tool_calls > $max_tool_calls) {
      $state = ($state | add-tool-budget-exhausted $tool_calls)
      break
    }
    $state = ($state | process-tools-once --tools $tools)
    $state = ($state | trace-turn $turn $calls tools)
  }
  if (not $final) and $finalize {
    $state = ($state | add-budget-exhausted $max_turns | complete-once --model $model --tools none)
  }
  $state
}

export def mark-loop-start [name: string = "loop"] {
  $in | add-trace loop-start { name: $name }
}
