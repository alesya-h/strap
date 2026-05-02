#!/usr/bin/env nu

def strap-bin [] { $env.STRAP_BIN? | default ($env.STRAP_ROOT | path join bin strap) }

def usage [] {
  error make { msg: "Usage: strap llm <compile|call|complete> [--model current|name|path.json] [--tools all|fs|process|web|agent|scripts|tools.json] < state.json" }
}

export def main [command?: string, --model: string = "current", --tools: string = "all"] {
  if not (($command | default "") in [compile call complete]) { usage }
  let config = (run-external (strap-bin) model show $model | from json)
  let provider = $config.provider
  $in | to json | run-external (strap-bin) provider $provider $command "--model" $model "--tools" $tools | from json
}
