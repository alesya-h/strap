#!/usr/bin/env nu

const builtin_groups = [fs process web agent scripts jsmcp]
const empty_schema = {type: "object", properties: {}, additionalProperties: true}

def usage [] {
  print -e "Usage: strap tools list [--group all|fs|process|web|agent|scripts|jsmcp|path.json] [--json]"
  exit 2
}

def root [] { $env.STRAP_ROOT? | default (pwd) }
def workspace [] { $env.STRAP_WORKSPACE? | default (pwd) }

def tool-dirs [] {
  let configured = (($env.STRAP_TOOL_PATH? | default "") | split row ":" | where {|x| $x != "" })
  $configured | append [(workspace | path join tools) (root | path join tools)]
}

def safe-name [file: string] {
  $file | path basename | str replace -r '\.[^.]+$' '' | str replace -a -r '[^a-zA-Z0-9_]' '_'
}

def executable? [file: string] {
  ^test -f $file
  if $env.LAST_EXIT_CODE != 0 { return false }
  ^test -x $file
  $env.LAST_EXIT_CODE == 0
}

def sidecar [file: string] {
  let direct = $"($file).json"
  if ($direct | path exists) { return (open $direct) }
  let parsed = ($file | path parse)
  let sibling = ($parsed.parent | path join $"($parsed.stem).json")
  if ($sibling | path exists) { return (open $sibling) }
  {}
}

def script-tools [] {
  mut names = []
  mut specs = []
  for dir in (tool-dirs) {
    if not ($dir | path exists) { continue }
    for file in (ls $dir | where type == file | get name) {
      if ($file | str ends-with ".json") or not (executable? $file) { continue }
      let meta = (sidecar $file)
      let name = ($meta.name? | default (safe-name $file))
      if $name in $names { continue }
      $names = ($names | append $name)
      $specs = ($specs | append {
        name: $name
        description: ($meta.description? | default $"Run script tool ($file | path basename).")
        inputSchema: ($meta.inputSchema? | default ($meta.input_schema? | default ($meta.parameters? | default $empty_schema)))
      })
    }
  }
  $specs
}

def builtin-tools [group: string] {
  if $group == "scripts" { return (script-tools) }
  open ($env.STRAP_CMD_DIR | path join groups $"($group).json")
}

def load-tools [group: string] {
  if $group == "none" { return [] }
  if $group == "all" { return ($builtin_groups | each {|g| builtin-tools $g } | flatten) }
  if $group in $builtin_groups { return (builtin-tools $group) }
  let parsed = (open $group)
  if (($parsed | describe) | str starts-with list) { $parsed } else { $parsed.tools? | default [] }
}

def spec [tool: record] {
  {
    name: $tool.name
    description: ($tool.description? | default "")
    inputSchema: ($tool.inputSchema? | default ($tool.input_schema? | default ($tool.parameters? | default $empty_schema)))
  }
}

def main [command?: string = "list", --group: string = "all", --json] {
  if $command != "list" { usage }
  load-tools $group | each {|tool| spec $tool } | to json
}
