#!/usr/bin/env nu

use lib/common.nu
use lib/compile.nu
use lib/model.nu
use lib/tools.nu

def usage [] {
  error make { msg: "Usage: strap provider openrouter <compile|call|complete> [args]" }
}

def prepare [model_name: string, tools_name: string] {
  let input_state = $in
  let config = (model load $model_name)
  if $config.provider != "openrouter" {
    error make { msg: $"Model profile provider mismatch: expected openrouter, got ($config.provider)" }
  }

  {
    state: $input_state
    config: $config
    body: (compile request $input_state $config (tools load $tools_name))
  }
}

export def main [command?: string, --model: string = "current", --tools: string = "all"] {
  let input = $in
  match ($command | default "") {
    "compile" => {
      let prepared = ($input | prepare $model $tools)
      $prepared.body
    }
    "call" => {
      let prepared = ($input | prepare $model $tools)
      common post-json $prepared.config.base_url [$"Authorization: Bearer (common secret $prepared.config.auth)"] $prepared.body
    }
    "complete" => {
      let prepared = ($input | prepare $model $tools)
      let response = (common post-json $prepared.config.base_url [$"Authorization: Bearer (common secret $prepared.config.auth)"] $prepared.body)
      $prepared.state | update root.children { append (compile response-event $response) }
    }
    _ => usage
  }
}
