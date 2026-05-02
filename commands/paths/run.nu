#!/usr/bin/env nu

export def main [target: string = "all"] {
  match $target {
    "root" => { $env.STRAP_ROOT }
    "config" => { $env.STRAP_CONFIG }
    "global" => { $env.STRAP_GLOBAL }
    "project" => { $env.STRAP_PROJECT }
    "session" => { $env.STRAP_SESSION? | default "" }
    "work" => { $env.STRAP_WORK }
    "workspace" => { $env.STRAP_WORKSPACE }
    "all" => {
      [
        $"STRAP_ROOT=($env.STRAP_ROOT)"
        $"STRAP_CONFIG=($env.STRAP_CONFIG)"
        $"STRAP_GLOBAL=($env.STRAP_GLOBAL)"
        $"STRAP_PROJECT=($env.STRAP_PROJECT)"
        $"STRAP_SESSION=($env.STRAP_SESSION? | default '')"
        $"STRAP_WORK=($env.STRAP_WORK)"
        $"STRAP_WORKSPACE=($env.STRAP_WORKSPACE)"
      ] | str join "\n"
    }
    _ => { error make { msg: "Usage: strap paths [root|config|global|project|session|work|workspace|all]" } }
  }
}
