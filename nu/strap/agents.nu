use ./common.nu *

export def list [--paths] { call-json ([agents list] ++ (maybe-switch "--paths" $paths)) }
export def show [name: string, --paths] { call-json ([agents show $name] ++ (maybe-switch "--paths" $paths)) }
export def apply [name: string, --actor: string = "assistant"] { $in | filter-json [agents apply $name "--actor" $actor] }
export def roots [] { call-json [agents roots] }
export def import-opencode [source: string = ""] { call-json ([agents import-opencode] ++ (if $source == "" { [] } else { [$source] })) }
