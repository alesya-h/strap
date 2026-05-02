def root [] { $env.STRAP_ROOT? | default (pwd) }
def run-path [] { root | path join commands provider run }
def env-map [] { { STRAP_ROOT: (root), STRAP_CMD_DIR: (root | path join commands provider), STRAP_CONFIG: (root | path join config strap), STRAP_GLOBAL: ($env.STRAP_GLOBAL? | default ($nu.home-dir | path join .config strap)), STRAP_PROJECT: ($env.STRAP_PROJECT? | default ((pwd) | path join .strap)), STRAP_WORK: ($env.STRAP_WORK? | default ((pwd) | path join .strap-user)), STRAP_WORKSPACE: ($env.STRAP_WORKSPACE? | default (pwd)) } }

export def --wrapped main [...args: string, --stdin, --text] {
  let argv = ($args | each {|arg| $arg | into string })
  let input = $in
  let out = with-env (env-map) { if $stdin { $input | to json | run-external (run-path) ...$argv } else { run-external (run-path) ...$argv } }
  if $text { $out } else { $out | from json }
}
