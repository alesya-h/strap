def root [] { $env.STRAP_ROOT? | default (pwd) }
def run-path [] { $env.STRAP_CMD_DIR? | default (root | path join commands provider-anthropic) | path join run }

export def --wrapped main [command?: string, ...args: string] {
  let argv = ([($command | default "")] | append $args | where {|arg| $arg != "" } | each {|arg| $arg | into string })
  let input = $in
  $input | to json | run-external (run-path) ...$argv | from json
}
