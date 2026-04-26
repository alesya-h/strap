use ../nu/plumbing.nu *

# A first porcelain sketch for agent loops. It delegates provider/tool effects
# to Node filters and keeps the flow as immutable state pipes.

def root-bin [name: string] {
  let root = ($env.STRAP_ROOT? | default (pwd))
  [ $root bin $name ] | path join
}

export def complete-once [--model: string = "gpt-5.1", --tools: string = "all"] {
  $in | to json | ^node (root-bin strap-llm.js) complete-openai --model $model --tools $tools | from json
}

export def complete-provider-once [--provider: path, --tools: string = "all"] {
  $in | to json | ^node (root-bin strap-llm.js) complete --provider $provider --tools $tools | from json
}

export def process-tools-once [--tools: string = "all"] {
  $in | to json | ^node (root-bin strap-run-calls.js) --tools $tools | from json
}

export def complete-and-process [--model: string = "gpt-5.1", --tools: string = "all"] {
  $in | complete-once --model $model --tools $tools | process-tools-once --tools $tools
}

export def complete-provider-and-process [--provider: path, --tools: string = "all"] {
  $in | complete-provider-once --provider $provider --tools $tools | process-tools-once --tools $tools
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
  $state | update root.children { |children| $children | append $event }
}

export def run-provider [provider: path, tools: string = "all", max_turns: int = 8, finalize: bool = true] {
  mut state = $in
  mut final = false
  for turn in 1..$max_turns {
    $state = ($state | complete-provider-once --provider $provider --tools $tools)
    if not ($state | has-tool-calls) {
      $final = true
      break
    }
    $state = ($state | process-tools-once --tools $tools)
  }
  if (not $final) and $finalize {
    $state = ($state | add-budget-exhausted $max_turns | complete-provider-once --provider $provider --tools none)
  }
  $state
}

export def run-openai [model: string = "gpt-5.1", tools: string = "all", max_turns: int = 8, finalize: bool = true] {
  mut state = $in
  mut final = false
  for turn in 1..$max_turns {
    $state = ($state | complete-once --model $model --tools $tools)
    if not ($state | has-tool-calls) {
      $final = true
      break
    }
    $state = ($state | process-tools-once --tools $tools)
  }
  if (not $final) and $finalize {
    $state = ($state | add-budget-exhausted $max_turns | complete-once --model $model --tools none)
  }
  $state
}

export def mark-loop-start [name: string = "loop"] {
  $in | add-trace loop-start { name: $name }
}
