use ./common.nu *

export def show [--paths] { call-json ([status] ++ (maybe-switch "--paths" $paths)) }
