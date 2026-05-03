def root [] { $env.STRAP_ROOT? | default (pwd) }
def run-path [] { root | path join commands run-calls run }
def env-map [] { { STRAP_ROOT: (root), STRAP_CMD_DIR: (root | path join commands run-calls), STRAP_CONFIG: (root | path join config strap), STRAP_GLOBAL: ($env.STRAP_GLOBAL? | default ($nu.home-dir | path join .config strap)), STRAP_PROJECT: ($env.STRAP_PROJECT? | default ((pwd) | path join .strap)), STRAP_WORK: ($env.STRAP_WORK? | default ((pwd) | path join .strap-user)), STRAP_WORKSPACE: ($env.STRAP_WORKSPACE? | default (pwd)) } }

export def main [--tools: string = "all"] {
  let input = $in
  with-env (env-map) { $input | to json | run-external (run-path) "--tools" $tools } | from json
}
