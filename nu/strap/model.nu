use ../../commands/model/run.nu

def root [] { $env.STRAP_ROOT? | default (pwd) }
def env-map [] { { STRAP_ROOT: (root), STRAP_CONFIG: (root | path join config strap), STRAP_GLOBAL: ($env.STRAP_GLOBAL? | default ($nu.home-dir | path join .config strap)), STRAP_PROJECT: ($env.STRAP_PROJECT? | default ((pwd) | path join .strap)), STRAP_WORK: ($env.STRAP_WORK? | default ((pwd) | path join .strap-user)), STRAP_WORKSPACE: ($env.STRAP_WORKSPACE? | default (pwd)) } }
export def list [--paths] { with-env (env-map) { run list --paths=$paths } }
export def show [name: string = "current"] { with-env (env-map) { run show $name } }
export def current [] { with-env (env-map) { run current } }
export def use [name: string] { with-env (env-map) { run use $name } }
export def fork [source: string, target: string, --set-model-id: string = ""] { with-env (env-map) { if $set_model_id == "" { run fork $source $target } else { run fork $source $target --set-model-id $set_model_id } } }
export def roots [] { with-env (env-map) { run roots } }
