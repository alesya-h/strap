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

export def mark-loop-start [name: string = "loop"] {
  $in | add-trace loop-start { name: $name }
}
