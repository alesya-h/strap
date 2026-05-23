#!/usr/bin/env nu

def context-events [input: any] {
  if (($input.messages? | default null) != null) { return $input.messages }
  if (($input.events? | default null) != null) { return $input.events }
  if (($input.history? | default null) != null) { return $input.history }
  error make { msg: "Expected strap.context.v0.1 or strap.state.v0.4 JSON" }
}

def render-event [event: record] { $"[($event.from? | default 'unknown')]\n($event.text? | default '')" | str trim }
def render-conversation [events: list<any>, title: string] { let body = ($events | each {|event| render-event $event } | str join "\n\n"); $"<conversation title=\"($title)\">\n\n($body)\n\n</conversation>\n" }

def state-with-context [input: any] { let strap = ($env.STRAP_BIN? | default ($env.STRAP_ROOT | path join bin strap)); mut state = (^$strap state init | from json); $state | update history { append (context-events $input) } }
def answer-from [state: record] { let matches = ($state.history | reverse | where {|event| (($event.text? | default "") != "") and (($event.calls? | default [] | length) == 0) }); if ($matches | is-empty) { "" } else { $matches | first | get text } }
def append-user [text: string] { $in | update history { append { from: "user", text: $text } } }

def apply-agent-and-skills [agent: string, skill: string] {
  let state = $in; let strap = ($env.STRAP_BIN? | default ($env.STRAP_ROOT | path join bin strap)); mut out = $state
  if $agent != "" { $out = ($out | to json | ^$strap agents apply $agent | from json) }
  if $skill != "" { $out = ($out | to json | ^$strap skills apply $skill | from json) }
  $out
}

def usage [] { error make { msg: "Usage: strap context <quote|render|summarize> [args] < context.json" } }

export def main [command?: string, ...framing_parts: string, --title: string = "quoted conversation", --model: string = "current", --agent: string = "", --skill: string = "", --tools: string = "none", --max-turns: int = 8, --dry-run] {
  if ($command | is-empty) { usage }
  let input = $in
  match $command {
    "quote" => { state-with-context $input }
    "render" => { render-conversation (context-events $input) $title }
    "summarize" => {
      let framing = if ($framing_parts | is-empty) { "Summarize the conversation above." } else { $framing_parts | str join " " }
      let strap = ($env.STRAP_BIN? | default ($env.STRAP_ROOT | path join bin strap))
      mut state = (state-with-context $input | apply-agent-and-skills $agent $skill | append-user $"Please summarize the conversation above with this framing:\n\n($framing)")
      if not $dry_run { $state = ($state | to json | ^$strap loop --model $model --tools $tools --max-turns $max_turns | from json) }
      answer-from $state
    }
    _ => { usage }
  }
}
