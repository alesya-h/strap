#!/usr/bin/env nu

def read-state [file: string] {
  if $file == "-" { $in } else { open $file }
}

def append-event [event: record] {
  let state = $in
  $state | update root.children { append ({ type: "event" } | merge $event) }
}

def usage [] {
  error make { msg: "Usage: strap agent fork --prompt <text> < parent.json > child.json | strap agent fold --child child.json --summary <text> < parent.json > parent-next.json" }
}

export def main [command?: string, ...args: string, --prompt: string = "", --child: string = "", --summary: string = "", --file: string = "-"] {
  if ($command | is-empty) { usage }
  let input = $in

  match $command {
    "fork" => {
      let text = if $prompt == "" { $args | str join " " } else { $prompt }
      let state = ($input | read-state $file)
      let next = ($state | upsert parent { fork_prompt: $text, created_at: (date now | into string) } | append-event { from: "harness", to: ["assistant"], kind: "fork", text: $text })
      $next
    }
    "fold" => {
      if $child == "" or $summary == "" { usage }
      let parent = ($input | read-state $file)
      let child_state = (open $child)
      let next = ($parent | append-event { from: "harness", to: ["assistant", "user"], kind: "agent_fold", text: $summary, hidden: { child_state: $child_state } })
      $next
    }
    _ => { usage }
  }
}
