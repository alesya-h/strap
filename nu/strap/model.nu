use ./common.nu *

export def list [--paths] { call-json ([model list] ++ (maybe-switch "--paths" $paths)) }
export def show [name: string = "current"] { call-json [model show $name] }
export def current [] { call-json [model current] }
export def fork [source: string, target: string, --set-model-id: string = ""] { call-json ([model fork $source $target] ++ (maybe-flag "--set-model-id" $set_model_id)) }
export def roots [] { call-json [model roots] }
