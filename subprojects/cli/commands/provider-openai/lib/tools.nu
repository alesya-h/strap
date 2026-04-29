export def load [group: string] {
  if $group == "none" { return [] }
  let resolved_group = if $group == "" { "all" } else { $group }
  run-external ($env.STRAP_BIN? | default "strap") tools list "--group" $resolved_group "--json" | from json
}
