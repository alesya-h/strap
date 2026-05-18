#!/usr/bin/env nu

def parse-entry [entry: string] {
  let parts = ($entry | split row -n 2 "=")
  if (($parts | length) == 2) {
    { name: ($parts | get 0), path: (($parts | get 1) | path expand) }
  } else {
    { name: null, path: ($entry | path expand) }
  }
}

def layers [] {
  $env.STRAP_PATH
  | split row (char esep)
  | where {|item| $item != "" }
  | each {|item| parse-entry $item }
}

def artifact-dir [kind: string] {
  match $kind {
    "command" => "commands"
    "tool" => "tools"
    "agent" => "agents"
    "skill" => "skills"
    "model" => "models"
    _ => { error make { msg: $"Unknown artifact type: ($kind)" } }
  }
}

def usage [] { error make { msg: "Usage: strap layers [list|roots <artifact-type>]" } }

export def main [command: string = "list", kind?: string] {
  match $command {
    "list" => { layers }
    "roots" => {
      if ($kind | is-empty) { usage }
      let subdir = (artifact-dir $kind)
      layers | each {|layer| $layer | insert root ($layer.path | path join $subdir) }
    }
    _ => { usage }
  }
}
