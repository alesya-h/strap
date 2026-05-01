#!/usr/bin/env nu

use lib/common.nu
use lib/compile.nu
use lib/embed.nu
use lib/model.nu
use lib/tools.nu

def usage [] {
  print -e "Usage: strap provider openai <compile|call|complete|embed> [args]"
  exit 2
}

def assert-provider [config: record] {
  if $config.provider != "openai" {
    error make { msg: $"Model profile provider mismatch: expected openai, got ($config.provider)" }
  }
}

def prepare [model_name: string, tools_name: string, file: string] {
  let input_state = (common read-input $file)
  let config = (model load $model_name)
  assert-provider $config

  {
    state: $input_state
    config: $config
    body: (compile request $input_state $config (tools load $tools_name))
  }
}

def command-compile [model_name: string, tools_name: string, file: string] {
  let prepared = (prepare $model_name $tools_name $file)
  $prepared.body | common write-json
}

def command-call [model_name: string, tools_name: string, file: string] {
  let prepared = (prepare $model_name $tools_name $file)
  common post-json $prepared.config.base_url [$"Authorization: Bearer (common secret $prepared.config.auth)"] $prepared.body | common write-json
}

def command-complete [model_name: string, tools_name: string, file: string] {
  let prepared = (prepare $model_name $tools_name $file)
  let response = (common post-json $prepared.config.base_url [$"Authorization: Bearer (common secret $prepared.config.auth)"] $prepared.body)
  $prepared.state | update root.children { append ({ type: "event" } | merge (compile response-event $response $prepared.config.api)) } | common write-json
}

def main [command?: string, --model: string = "current", --tools: string = "all", --file: string = "-", --dimensions: string = ""] {
  match ($command | default "") {
    "compile" => { command-compile $model $tools $file }
    "call" => { command-call $model $tools $file }
    "complete" => { command-complete $model $tools $file }
    "embed" => { embed command $model $file $dimensions }
    _ => usage
  }
}
