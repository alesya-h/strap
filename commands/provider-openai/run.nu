#!/usr/bin/env nu

use lib/common.nu
use lib/compile.nu
use lib/model.nu
use lib/tools.nu

def usage [] {
  error make { msg: "Usage: strap provider openai <compile|call|complete|embed> [args]" }
}

def assert-provider [config: record] {
  if $config.provider != "openai" {
    error make { msg: $"Model profile provider mismatch: expected openai, got ($config.provider)" }
  }
}

def prepare [model_name: string, tools_name: string] {
  let input_state = $in
  let config = (model load $model_name)
  assert-provider $config

  {
    state: $input_state
    config: $config
    body: (compile request $input_state $config (tools load $tools_name))
  }
}

def command-compile [model_name: string, tools_name: string] {
  let prepared = ($in | prepare $model_name $tools_name)
  $prepared.body
}

def command-call [model_name: string, tools_name: string] {
  let prepared = ($in | prepare $model_name $tools_name)
  common post-json $prepared.config.base_url [$"Authorization: Bearer (common secret $prepared.config.auth)"] $prepared.body
}

def active-agent [state: record] { $state | get --optional runtime.active_agent | default "" }

def model-event [state: record, event: record] {
  let agent = (active-agent $state)
  let base = ({ type: "event" } | merge $event)
  if $agent == "" { $base } else { $base | insert agent $agent }
}

def command-complete [model_name: string, tools_name: string] {
  let prepared = ($in | prepare $model_name $tools_name)
  let response = (common post-json $prepared.config.base_url [$"Authorization: Bearer (common secret $prepared.config.auth)"] $prepared.body)
  $prepared.state | update root.children { append (model-event $prepared.state (compile response-event $response $prepared.config.api)) }
}

def command-embed [model_name: string, dimensions: string] {
  let raw = $in
  let texts = ($raw.texts? | default [($raw.text? | default "")])
  let embed_model = if $model_name == "current" {
    $env.STRAP_EMBED_MODEL? | default ($env.STRAP_ZK_EMBED_MODEL? | default "text-embedding-3-small")
  } else {
    $model_name
  }
  mut body = { model: $embed_model, input: $texts }
  if $dimensions != "" { $body = ($body | insert dimensions ($dimensions | into int)) }
  let response = (common post-json "https://api.openai.com/v1/embeddings" [$"Authorization: Bearer (common secret { type: 'api_key', env: 'OPENAI_API_KEY' })"] $body)
  { model: $body.model, dimensions: (($response.data.0.embedding | length) | default 0), embeddings: ($response.data | each {|item| $item.embedding }) }
}

export def main [command?: string, --model: string = "current", --tools: string = "all", --dimensions: string = ""] {
  let input = $in
  match ($command | default "") {
    "compile" => { $input | command-compile $model $tools }
    "call" => { $input | command-call $model $tools }
    "complete" => { $input | command-complete $model $tools }
    "embed" => { $input | command-embed $model $dimensions }
    _ => usage
  }
}
