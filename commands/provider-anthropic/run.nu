#!/usr/bin/env nu

use lib/common.nu
use lib/compile.nu
use lib/model.nu
use lib/tools.nu

def usage [] {
  error make { msg: "Usage: strap provider anthropic <compile|call|complete> [args]" }
}

def headers [config: record] {
  [
    $"x-api-key: (common secret $config.auth)"
    $"anthropic-version: ($config.anthropic_version? | default '2023-06-01')"
  ]
}

def prepare [model_name: string, tools_name: string] {
  let input_state = $in
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

export def main [command?: string, --model: string = "current", --tools: string = "all"] {
  let input = $in
  match ($command | default "") {
    "compile" => {
      let prepared = ($input | prepare $model $tools)
      $prepared.body
    }
    "call" => {
      let prepared = ($input | prepare $model $tools)
      common post-json $prepared.config.base_url (headers $prepared.config) $prepared.body
    }
    "complete" => {
      let prepared = ($input | prepare $model $tools)
      let response = (common post-json $prepared.config.base_url (headers $prepared.config) $prepared.body)
      $prepared.state | update root.children { append (compile response-event $response) }
    }
    _ => usage
  }
}
