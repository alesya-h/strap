# Nushell wrappers for the strap immutable JSON filter CLIs.
# Set STRAP_ROOT when importing from outside the repository.

def strap-root [] {
  $env.STRAP_ROOT? | default (pwd)
}

def strap-file [parts: list<string>] {
  $parts | prepend (strap-root) | path join
}

export def init [] {
  ^node (strap-file [subprojects core bin state.js]) init | from json
}

export def add-user [text: string] {
  $in | to json | ^node (strap-file [subprojects core bin state.js]) add-user $text | from json
}

export def add-assistant [text: string] {
  $in | to json | ^node (strap-file [subprojects core bin state.js]) add-assistant $text | from json
}

export def push [label: string] {
  $in | to json | ^node (strap-file [subprojects core bin state.js]) push $label | from json
}

export def pop [summary: string] {
  $in | to json | ^node (strap-file [subprojects core bin state.js]) pop $summary | from json
}

export def compile-openai [--model: string = "gpt-5.1", --tools: string = "all"] {
  $in | to json | ^node (strap-file [subprojects providers bin llm.js]) compile-openai --model $model --tools $tools | from json
}

export def compile [--provider: path, --tools: string = "all"] {
  $in | to json | ^node (strap-file [subprojects providers bin llm.js]) compile --provider $provider --tools $tools | from json
}

export def complete-openai [--model: string = "gpt-5.1", --tools: string = "all"] {
  $in | to json | ^node (strap-file [subprojects providers bin llm.js]) complete-openai --model $model --tools $tools | from json
}

export def complete [--provider: path, --tools: string = "all"] {
  $in | to json | ^node (strap-file [subprojects providers bin llm.js]) complete --provider $provider --tools $tools | from json
}

export def process-tools [--tools: string = "all"] {
  $in | to json | ^node (strap-file [subprojects tools bin run-calls.js]) --tools $tools | from json
}

export def fork [--prompt: string = ""] {
  $in | to json | ^node (strap-file [subprojects core bin agent.js]) fork --prompt $prompt | from json
}

export def fold [--child: path, --summary: string] {
  $in | to json | ^node (strap-file [subprojects core bin agent.js]) fold --child $child --summary $summary | from json
}

export def display-last-message [] {
  $in | to json | ^node (strap-file [subprojects core bin state.js]) display-last-message
}
