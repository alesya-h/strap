def root [] { $env.STRAP_ROOT? | default (pwd) }

def run-path [] { root | path join commands provider-chatgpt run }

def env-map [] {
  {
    STRAP_ROOT: (root)
    STRAP_CMD_DIR: (root | path join commands provider-chatgpt)
    STRAP_CONFIG: (root | path join config strap)
    STRAP_GLOBAL: ($env.STRAP_GLOBAL? | default ($nu.home-dir | path join .config strap))
    STRAP_PROJECT: ($env.STRAP_PROJECT? | default ((pwd) | path join .strap))
    STRAP_WORK: ($env.STRAP_WORK? | default ((pwd) | path join .strap-user))
    STRAP_WORKSPACE: ($env.STRAP_WORKSPACE? | default (pwd))
  }
}

def takes-input [command: string] {
  $command in [compile call complete]
}

export def --wrapped main [command?: string, ...args: string] {
  let argv = ([($command | default "")] | append $args | where {|arg| $arg != "" } | each {|arg| $arg | into string })
  let input = $in
  let out = with-env (env-map) {
    if (takes-input ($command | default "")) {
      $input | to json | run-external (run-path) ...$argv
    } else {
      run-external (run-path) ...$argv
    }
  }
  $out | from json
}
