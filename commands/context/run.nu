#!/usr/bin/env nu

def flatten-node [node: record] {
  if (($node.type? | default "") == "event") {
    [$node]
  } else if (($node.type? | default "") == "scope") and (($node.status? | default "open") == "collapsed") {
    [{ type: "event", from: "harness", to: ($node.participants? | default []), kind: "summary", text: ($node.summary? | default $"[collapsed scope: ($node.label? | default 'scope')]") }]
  } else if (($node.type? | default "") == "scope") {
    $node.children? | default [] | reduce --fold [] {|child, acc| $acc | append (flatten-node $child) }
  } else {
    []
  }
}

def context-events [input: any] {
  if (($input.events? | default null) != null) { return $input.events }
  if (($input.root?.type? | default "") == "scope") { return (flatten-node $input.root) }
  if (($input.nodes? | default null) != null) { return ($input.nodes | reduce --fold [] {|node, acc| $acc | append (flatten-node $node) }) }
  error make { msg: "Expected strap.context.v0.1 or strap.state.v0.2 JSON" }
}

def render-event [event: record] {
  let to = (if (($event.to? | default null) | describe) =~ '^list' { $event.to | str join "," } else { $event.to? | default "all" })
  $"[($event.from? | default 'unknown') -> ($to); ($event.kind? | default 'message')]\n($event.text? | default ($event.summary? | default ''))" | str trim
}

def render-conversation [events: list<any>, title: string] {
  let body = ($events | each {|event| render-event $event } | str join "\n\n")
  $"<conversation title=\"($title)\">\n\n($body)\n\n</conversation>\n"
}

def state-with-context [input: any] {
  let events = (context-events $input)
  let strap = ($env.STRAP_BIN? | default ($env.STRAP_ROOT | path join bin strap))
  mut state = (^$strap state init | from json)
  $state | update root.children { append $events }
}

def answer-from [state: record] {
  let matches = ($state.root.children | reverse | where {|event|
    let is_text_answer = (($event.text? | default "") != "") and (($event.calls? | default [] | length) == 0)
    (($event.type? | default "") == "event") and (($event.from? | default "") == "assistant") and $is_text_answer
  })
  if ($matches | is-empty) { "" } else { $matches | first | get text }
}

def append-user [text: string] {
  let state = $in
  $state | update root.children { append { type: "event", from: "user", to: ["assistant"], kind: "message", text: $text } }
}

def apply-agent-and-skills [agent: string, skill: string] {
  let state = $in
  let strap = ($env.STRAP_BIN? | default ($env.STRAP_ROOT | path join bin strap))
  mut out = $state
  if $agent != "" { $out = ($out | to json | ^$strap agents apply $agent | from json) }
  if $skill != "" { $out = ($out | to json | ^$strap skills apply $skill | from json) }
  $out
}

def usage [] { error make { msg: "Usage: strap context <quote|render|summarize> [args] < context.json" } }

export def main [command?: string, ...framing_parts: string, --title: string = "quoted conversation", --model: string = "current", --agent: string = "", --skill: string = "", --tools: string = "none", --max-turns: int = 8, --dry-run] {
  if ($command | is-empty) { usage }
  let input = $in
  match $command {
    "quote" => {
      state-with-context $input
    }
    "render" => { render-conversation (context-events $input) $title }
    "summarize" => {
      let framing = if ($framing_parts | is-empty) { "Summarize the conversation above." } else { $framing_parts | str join " " }
      let task = $"Please summarize the conversation above with this framing:\n\n($framing)"
      let strap = ($env.STRAP_BIN? | default ($env.STRAP_ROOT | path join bin strap))
      mut state = (state-with-context $input | apply-agent-and-skills $agent $skill | append-user $task)
      if not $dry_run { $state = ($state | to json | ^$strap loop --model $model --tools $tools --max-turns $max_turns | from json) }
      answer-from $state
    }
    _ => { usage }
  }
}
