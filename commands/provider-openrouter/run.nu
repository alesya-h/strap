#!/usr/bin/env nu

use lib/common.nu
use lib/compile.nu
use lib/model.nu
use lib/tools.nu

const default_embed_model = "nvidia/llama-nemotron-embed-vl-1b-v2:free"
const default_embed_url = "https://openrouter.ai/api/v1/embeddings"

def usage [] {
  error make { msg: "Usage: strap provider openrouter <compile|call|complete|embed> [args]" }
}

def assert-chat [config: record] {
  if $config.provider != "openrouter" {
    error make { msg: $"Model profile provider mismatch: expected openrouter, got ($config.provider)" }
  }
  if $config.api != "chat" {
    error make { msg: $"OpenRouter completion requires a chat model profile, got api=($config.api)" }
  }
}

def prepare [model_name: string, tools_name: string] {
  let input_state = $in
  let config = (model load $model_name)
  assert-chat $config

  {
    state: $input_state
    config: $config
    body: (compile request $input_state $config (tools load $tools_name))
  }
}

def embedding-config [model_name: string] {
  let selected = if $model_name == "current" {
    $env.STRAP_OPENROUTER_EMBED_MODEL? | default ($env.STRAP_EMBED_MODEL? | default ($env.STRAP_ZK_EMBED_MODEL? | default $default_embed_model))
  } else {
    $model_name
  }
  if ($selected | str contains "/") {
    return { model: $selected, base_url: $default_embed_url }
  }
  let config = (model load $selected)
  if $config.provider != "openrouter" {
    error make { msg: $"Model profile provider mismatch: expected openrouter, got ($config.provider)" }
  }
  if $config.api != "embeddings" {
    error make { msg: $"OpenRouter embeddings require an embeddings model profile, got api=($config.api)" }
  }
  { model: $config.model, base_url: $config.base_url }
}

def command-embed [model_name: string] {
  let raw = $in
  let texts = ($raw.texts? | default [($raw.text? | default "")])
  let embed = (embedding-config $model_name)
  let response = (common post-json $embed.base_url [$"Authorization: Bearer (common secret { type: 'api_key', env: 'OPENROUTER_API_KEY' })"] { model: $embed.model, input: $texts, encoding_format: "float" })
  let embeddings = ($response.data? | default [] | each {|item| $item.embedding })
  let dimensions = if ($embeddings | is-empty) { 0 } else { $embeddings.0 | length }
  { model: $embed.model, dimensions: $dimensions, embeddings: $embeddings }
}

def model-event [state: record, event: record] {
  $event | upsert from ($state | get --optional runtime.active_model | default "model")
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
      $prepared.state | update history { append (model-event $prepared.state (compile response-event $response)) }
    }
    "embed" => { $input | command-embed $model }
    _ => usage
  }
}
