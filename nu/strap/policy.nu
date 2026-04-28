use ./common.nu *

export def list [] { call-json [policy list] }
export def show [name: string] { call-json [policy show $name] }
export def decide [--policy: string = "default", --action: string, --command: string = "", --path: string = ""] {
  call-json ([policy decide "--policy" $policy "--action" $action] ++ (maybe-flag "--command" $command) ++ (maybe-flag "--path" $path))
}
