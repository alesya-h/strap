#!/usr/bin/env nu

const empty_schema = {type: "object", properties: {}, additionalProperties: true}

def usage [] {
  print -e "Usage: strap tools list [--group all|name|name,name|path.json] [--json] [--internal]"
  exit 2
}

def root [] { $env.STRAP_ROOT? | default (pwd) }
def workspace [] { $env.STRAP_WORKSPACE? | default (pwd) }

def tool-dirs [] {
  let configured = (($env.STRAP_TOOL_PATH? | default "") | split row ":" | where {|x| $x != "" })
  let session = if (($env.STRAP_SESSION? | default "") == "") { [] } else { [($env.STRAP_SESSION | path join overlay tools)] }
  $configured | append $session | append [
    ($env.STRAP_WORK? | default (workspace | path join .strap-user) | path join tools)
    ($env.STRAP_PROJECT? | default (workspace | path join .strap) | path join tools)
    ($env.STRAP_GLOBAL? | default (($env.XDG_CONFIG_HOME? | default ($env.HOME | path join .config)) | path join strap) | path join tools)
    (root | path join tools)
  ]
}

def group-dirs [] {
  mut out = []
  mut seen = []
  for dir in (tool-dirs) {
    if not ($dir | path exists) { continue }
    for entry in (ls $dir | where type == dir) {
      let run = ($entry.name | path join run)
      if not ($run | path exists) { continue }
      let group = ($entry.name | path basename)
      if $group in $seen { continue }
      $seen = ($seen | append $group)
      $out = ($out | append {group: $group, dir: $entry.name, run: $run})
    }
  }
  $out
}

def meta-map [dir: string] {
  let meta_json = ($dir | path join meta.json)
  mut out = if ($meta_json | path exists) { open $meta_json } else { {} }
  let meta_dir = ($dir | path join meta)
  if not ($meta_dir | path exists) { return $out }
  for file in (ls $meta_dir | where type == file | where name =~ '\.json$') {
    let action = ($file.name | path parse | get stem)
    $out = ($out | upsert $action (open $file.name))
  }
  $out
}

def specs-for [entry: record] {
  let meta = (meta-map $entry.dir)
  $meta | transpose action spec | each {|row|
    let action = $row.action
    let spec = $row.spec
    {
      name: ($spec.name? | default $"($entry.group).($action)")
      group: $entry.group
      action: $action
      process_state: ($spec.process_state? | default "none")
      runner: $entry.run
      description: ($spec.description? | default "")
      inputSchema: ($spec.inputSchema? | default ($spec.input_schema? | default ($spec.parameters? | default $empty_schema)))
    }
  }
}

def load-tools [group: string] {
  if $group == "none" { return [] }
  if ($group | str ends-with ".json") or ($group | str contains "/") {
    let parsed = (open $group)
    return (if (($parsed | describe) | str starts-with list) { $parsed } else { $parsed.tools? | default [] })
  }
  let requested = if $group == "all" { [] } else { $group | split row "," | each { str trim } | where {|x| $x != "" } }
  group-dirs | where {|entry| ($requested | is-empty) or ($entry.group in $requested) } | each {|entry| specs-for $entry } | flatten
}

def public-spec [tool: record] {
  { name: $tool.name, description: ($tool.description? | default ""), inputSchema: ($tool.inputSchema? | default $empty_schema) }
}

def main [command?: string = "list", --group: string = "all", --json, --internal] {
  if $command != "list" { usage }
  let tools = (load-tools $group)
  if $internal { $tools | to json } else { $tools | each {|tool| public-spec $tool } | to json }
}
