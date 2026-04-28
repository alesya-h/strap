use ./common.nu *

export def list [--paths] { call-json ([skills list] ++ (maybe-switch "--paths" $paths)) }
export def show [name: string, --paths] { call-json ([skills show $name] ++ (maybe-switch "--paths" $paths)) }
export def apply [name: string, --actor: string = "assistant"] { $in | filter-json [skills apply $name "--actor" $actor] }
export def roots [] { call-json [skills roots] }
export def import-opencode [source: string = ""] { call-json ([skills import-opencode] ++ (if $source == "" { [] } else { [$source] })) }
