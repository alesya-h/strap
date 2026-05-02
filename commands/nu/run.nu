#!/usr/bin/env nu

def module-path [name: string] {
  match $name {
    "strap" => { $env.STRAP_ROOT | path join nu strap }
    _ => { error make { msg: "Usage: strap nu path <strap>" } }
  }
}

export def main [command?: string, module?: string] {
  match ($command | default "") {
    "modules" => {
      [
        { name: "strap", kind: "module", path: ($env.STRAP_ROOT | path join nu strap) }
      ]
    }
    "path" => { module-path ($module | default "") }
    "lib-dir" => { $env.STRAP_ROOT | path join nu }
    "env-line" => { $"$env.NU_LIB_DIRS = \($env.NU_LIB_DIRS | prepend '($env.STRAP_ROOT | path join nu)'\)" }
    "source-line" => { $"source '(module-path ($module | default 'strap'))'" }
    "use-line" => {
      let name = ($module | default "strap")
      let path = (module-path $name)
      $"use '($path)'"
    }
    _ => { error make { msg: "Usage: strap nu <modules|path|lib-dir|env-line|use-line|source-line> [module]" } }
  }
}
