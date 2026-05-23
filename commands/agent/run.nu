#!/usr/bin/env nu

def append-message [message: record] { let state = $in; $state | update history { append $message } }
def usage [] { error make { msg: "Usage: strap agent fork --prompt <text> < parent.json > child.json | strap agent fold --child child.json --summary <text> < parent.json > parent-next.json" } }
def active-model [state: record] { $state | get --optional runtime.active_model | default "model" }

def model-message [state: record, call: record] { { from: (active-model $state), text: "", calls: [$call] } }

export def main [command?: string, ...args: string, --prompt: string = "", --child: string = "", --summary: string = ""] {
  if ($command | is-empty) { usage }
  let input = $in
  match $command {
    "fork" => { let text = if $prompt == "" { $args | str join " " } else { $prompt }; $input | append-message { from: "user", text: $text } }
    "fold" => {
      if $child == "" or $summary == "" { usage }
      let child_state = (open $child)
      let call = { id: $"fork_((random uuid) | str substring 0..7)", tool: "agent.fork", input: { task: ($child_state | get --optional parent.fork_prompt | default "child branch") }, ok: true, output: { summary: $summary }, hidden: { messages: ($child_state | get --optional history | default []) } }
      $input | append-message (model-message $input $call)
    }
    _ => { usage }
  }
}
