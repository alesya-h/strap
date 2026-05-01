# Nushell wrappers for strap immutable JSON filter commands.
# Set STRAP_ROOT when importing from outside the repository.

def strap-root [] {
  $env.STRAP_ROOT? | default (pwd)
}

def strap-file [parts: list<string>] {
  $parts | prepend (strap-root) | path join
}

def strap-bin [] {
  $env.STRAP_BIN? | default (strap-file [bin strap])
}

export def init [] {
  ^(strap-bin) state init | from json
}

export def add-user [text: string] {
  $in | to json | ^(strap-bin) state add-user $text | from json
}

export def add-assistant [text: string] {
  $in | to json | ^(strap-bin) state add-assistant $text | from json
}

export def push [label: string] {
  $in | to json | ^(strap-bin) state push $label | from json
}

export def pop [summary: string] {
  $in | to json | ^(strap-bin) state pop $summary | from json
}

export def compile [--model: string = "current", --tools: string = "all"] {
  $in | to json | ^(strap-bin) llm compile --model $model --tools $tools | from json
}

export def complete [--model: string = "current", --tools: string = "all"] {
  $in | to json | ^(strap-bin) llm complete --model $model --tools $tools | from json
}

export def process-tools [--tools: string = "all"] {
  $in | to json | ^(strap-bin) run-calls --tools $tools | from json
}

export def fork [--prompt: string = ""] {
  $in | to json | ^(strap-bin) agent fork --prompt $prompt | from json
}

export def fold [--child: path, --summary: string] {
  $in | to json | ^(strap-bin) agent fold --child $child --summary $summary | from json
}

export def display-last-message [] {
  $in | to json | ^(strap-bin) state display-last-message
}
