#!/usr/bin/env nu

use lib/common.nu
use lib/compile.nu
use lib/model.nu
use lib/tools.nu

def usage [] {
  print -e "Usage: strap provider anthropic <compile|call|complete> [args]"
  exit 2
}

def headers [config: record] {
  [
    $"x-api-key: (common secret $config.auth)"
    $"anthropic-version: ($config.anthropic_version? | default '2023-06-01')"
  ]
}

def prepare [model_name: string, tools_name: string, file: string] {
  let input_state = (common read-input $file)
  let config = (model load $model_name)
  if $config.provider != "anthropic" {
    error make { msg: $"Model profile provider mismatch: expected anthropic, got ($config.provider)" }
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
      common post-json $prepared.config.base_url (headers $prepared.config) $prepared.body | common write-json
    }
    "complete" => {
      let prepared = (prepare $model $tools $file)
      let response = (common post-json $prepared.config.base_url (headers $prepared.config) $prepared.body)
      $prepared.state | update root.children { append (compile response-event $response) } | common write-json
    }
    _ => usage
  }
}
