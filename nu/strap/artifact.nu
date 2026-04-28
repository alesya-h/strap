use ./common.nu *

export def types [] { call-json [artifact types] }
export def roots [type: string] { call-json [artifact roots $type] }
export def status [type: string = "", --paths] { call-json ([artifact status] ++ (if $type == "" { [] } else { [$type] }) ++ (maybe-switch "--paths" $paths)) }
export def workon [type: string, name: string] { call-json [artifact workon $type $name] }
export def promote [type: string, name: string] { call-json [artifact promote $type $name] }
export def discard [type: string, name: string] { call-json [artifact discard $type $name] }
