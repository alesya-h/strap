export def load [group: string] {
  if $group == "none" { return [] }

  if not ($group in ["all" "fs" "process" "web" "agent" "scripts" "jsmcp"]) {
    let parsed = (open $group)
    if (($parsed | describe) | str starts-with "list") {
      return $parsed
    }
    return ($parsed.tools? | default [])
  }

  let resolved_group = if $group == "" { "all" } else { $group }
  let js = ([
    "import { getTools, publicToolSpec } from '#strap/tools/registry'; "
    "console.log(JSON.stringify(getTools("
    ($resolved_group | to json --raw)
    ").map(publicToolSpec)));"
  ] | str join "")

  ^node --input-type=module -e $js | from json
}
