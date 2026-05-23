#!/usr/bin/env nu

def append-event [event: record] {
  let state = $in
  $state | update root.children { append ({ type: "event" } | merge $event) }
}

def usage [] {
  error make { msg: "Usage: strap agent fork --prompt <text> < parent.json > child.json | strap agent fold --child child.json --summary <text> < parent.json > parent-next.json" }
}

def active-agent [state: record] { $state | get --optional runtime.active_agent | default "" }

def model-event [state: record, call: record] {
  let agent = (active-agent $state)
  let base = { from: "model", kind: "tool_request", text: "", calls: [$call] }
  if $agent == "" { $base } else { $base | insert agent $agent }
}

export def main [command?: string, ...args: string, --prompt: string = "", --child: string = "", --summary: string = ""] {
  if ($command | is-empty) { usage }
  let input = $in
  match $command {
    "fork" => {
      let text = if $prompt == "" { $args | str join " " } else { $prompt }
      $input | append-event { from: "user", kind: "message", text: $text }
    }
    "fold" => {
      if $child == "" or $summary == "" { usage }
      let child_state = (open $child)
      let call = { id: $"fork_((random uuid) | str substring 0..7)", tool: "agent.fork", input: { task: ($child_state | get --optional parent.fork_prompt | default "child branch") }, ok: true, output: { summary: $summary }, hidden: { messages: ($child_state | get --optional root.children | default []) } }
      $input | append-event (model-event $input $call)
    }
    _ => { usage }
  }
}
