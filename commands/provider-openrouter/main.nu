#!/usr/bin/env nu

use lib/common.nu
use lib/compile.nu
use lib/model.nu
use lib/tools.nu

def usage [] {
  print -e "Usage: strap provider openrouter <compile|call|complete> [args]"
  exit 2
}

def prepare [model_name: string, tools_name: string, file: string] {
  let input_state = (common read-input $file)
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

def main [command?: string, --model: string = "current", --tools: string = "all", --file: string = "-"] {
  match ($command | default "") {
    "compile" => {
      let prepared = (prepare $model $tools $file)
      $prepared.body | common write-json
    }
    "call" => {
      let prepared = (prepare $model $tools $file)
      common post-json $prepared.config.base_url [$"Authorization: Bearer (common secret $prepared.config.auth)"] $prepared.body | common write-json
    }
    "complete" => {
      let prepared = (prepare $model $tools $file)
      let response = (common post-json $prepared.config.base_url [$"Authorization: Bearer (common secret $prepared.config.auth)"] $prepared.body)
      $prepared.state | update root.children { append (compile response-event $response) } | common write-json
    }
    _ => usage
  }
}
