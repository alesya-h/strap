use ../../commands/skills/run.nu

def root [] { $env.STRAP_ROOT? | default (pwd) }
def env-map [] { { STRAP_ROOT: (root), STRAP_CONFIG: (root | path join config strap), STRAP_GLOBAL: ($env.STRAP_GLOBAL? | default ($nu.home-dir | path join .config strap)), STRAP_PROJECT: ($env.STRAP_PROJECT? | default ((pwd) | path join .strap)), STRAP_WORK: ($env.STRAP_WORK? | default ((pwd) | path join .strap-user)), STRAP_WORKSPACE: ($env.STRAP_WORKSPACE? | default (pwd)) } }
export def list [--paths] { with-env (env-map) { run list --paths=$paths } }
export def show [name: string, --paths] { with-env (env-map) { run show $name --paths=$paths } }
export def apply [name: string, --actor: string = "assistant"] { $in | run apply $name --actor $actor }
export def roots [] { with-env (env-map) { run roots } }
export def import-opencode [source: string = ""] { with-env (env-map) { if $source == "" { run import-opencode } else { run import-opencode $source } } }
