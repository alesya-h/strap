def root [] { $env.STRAP_ROOT? | default (pwd) }

def run-path [] { root | path join commands session run }

def env-map [] {
  {
    STRAP_ROOT: (root)
    STRAP_CMD_DIR: (root | path join commands session)
    STRAP_CONFIG: (root | path join config strap)
    STRAP_GLOBAL: ($env.STRAP_GLOBAL? | default ($nu.home-dir | path join .config strap))
    STRAP_PROJECT: ($env.STRAP_PROJECT? | default ((pwd) | path join .strap))
    STRAP_WORK: ($env.STRAP_WORK? | default ((pwd) | path join .strap-user))
    STRAP_WORKSPACE: ($env.STRAP_WORKSPACE? | default (pwd))
  }
}

def text-command [command: string] {
  $command in [resolve path state trace]
}

export def --wrapped main [...args: string] {
  let argv = ($args | each {|arg| $arg | into string })
  let command = ($argv | first | default "")
  let input = $in
  let out = with-env (env-map) {
    if $command == "save" {
      $input | to json | run-external (run-path) ...$argv
    } else {
      run-external (run-path) ...$argv
    }
  }
  if (text-command $command) { $out } else { $out | from json }
}
