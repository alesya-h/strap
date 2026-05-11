#!/usr/bin/env nu

def roots [] {
  let configured = ($env.STRAP_MODEL_PATH? | default "" | split row ":" | where {|item| $item != "" })
  let session = if (($env.STRAP_SESSION? | default "") == "") { [] } else { [($env.STRAP_SESSION | path join overlay models)] }
  $configured | append $session | append [
    (($env.STRAP_WORK? | default ((pwd) | path join .strap-user)) | path join models)
    (($env.STRAP_PROJECT? | default ((pwd) | path join .strap)) | path join models)
    (($env.STRAP_GLOBAL? | default ($nu.home-dir | path join .config strap)) | path join models)
    (($env.STRAP_ROOT? | default (pwd)) | path join config strap models)
  ]
}

def active-work-root [] {
  if (($env.STRAP_SESSION? | default "") == "") { $env.STRAP_WORK? | default ((pwd) | path join .strap-user) } else { $env.STRAP_SESSION | path join overlay }
}

def default-api [provider: string] {
  match $provider {
    "anthropic" => "messages"
    "openrouter" => "chat"
    "chatgpt" => "responses"
    _ => "responses"
  }
}

def default-base-url [provider: string, api: string] {
  match $provider {
    "anthropic" => "https://api.anthropic.com/v1/messages"
    "openrouter" => { if $api == "embeddings" { "https://openrouter.ai/api/v1/embeddings" } else { "https://openrouter.ai/api/v1/chat/completions" } }
    "chatgpt" => "https://chatgpt.com/backend-api/codex/responses"
    _ => { if $api == "chat" { "https://api.openai.com/v1/chat/completions" } else { "https://api.openai.com/v1/responses" } }
  }
}

def default-auth [provider: string] {
  match $provider {
    "anthropic" => { { type: "anthropic_api_key", env: "ANTHROPIC_API_KEY" } }
    "openrouter" => { { type: "api_key", env: "OPENROUTER_API_KEY" } }
    "chatgpt" => { { type: "chatgpt_oauth" } }
    _ => { { type: "api_key", env: "OPENAI_API_KEY" } }
  }
}

def normalize-model [config: record, file: string, fallback_name: string] {
  let provider = $config.provider
  let api = ($config.api? | default (default-api $provider))
  $config
  | upsert name ($config.name? | default $fallback_name)
  | upsert sourcePath $file
  | upsert api $api
  | upsert model $config.model_id
  | upsert base_url ($config.base_url? | default (default-base-url $provider $api))
  | upsert headers ($config.headers? | default {})
  | upsert auth ($config.auth? | default (default-auth $provider))
  | upsert parameters ($config.parameters? | default {})
}

def public-model [config: record, include_paths: bool] {
  let base = { name: $config.name, model_id: $config.model_id, provider: $config.provider, api: $config.api, source: ($config.sourcePath | path basename) }
  if $include_paths { $base | insert path $config.sourcePath } else { $base }
}

def resolve-model-file [name_or_path: string] {
  if ($name_or_path | str ends-with ".json") or ($name_or_path | str contains "/") {
    let direct = ($name_or_path | path expand)
    if ($direct | path exists) { return $direct }
  }
  let file_name = if ($name_or_path | str ends-with ".json") { $name_or_path } else { $"($name_or_path).json" }
  for root in (roots) {
    let file = ($root | path join $file_name)
    if ($file | path exists) { return $file }
  }
  error make { msg: $"Model profile not found: ($name_or_path)" }
}

def load-model [name_or_path: string] {
  let file = (resolve-model-file $name_or_path)
  normalize-model (open $file) $file ($file | path parse | get stem)
}

def list-models [include_paths: bool] {
  mut seen = []
  mut out = []
  for root in (roots) {
    if not ($root | path exists) { continue }
    for entry in (ls $root | where {|entry| ($entry.type == file or $entry.type == symlink) and ($entry.name | str ends-with ".json") }) {
      let name = ($entry.name | path parse | get stem)
      if ($name in $seen) { continue }
      $seen = ($seen | append $name)
      $out = ($out | append (public-model (normalize-model (open $entry.name) $entry.name $name) $include_paths))
    }
  }
  $out | sort-by name
}

def usage [] { error make { msg: "Usage: strap model <list|show|current|use|fork|roots> [args]" } }

export def main [command?: string, arg1?: string, arg2?: string, --paths, --set-model-id: string = ""] {
  match ($command | default "") {
    "list" => { list-models $paths }
    "show" => { load-model ($arg1 | default "current") }
    "current" => { load-model "current" }
    "roots" => { roots }
    "use" => {
      if ($arg1 | is-empty) { usage }
      let file = (resolve-model-file $arg1)
      let target_dir = (active-work-root | path join models)
      mkdir $target_dir
      let target = ($target_dir | path join current.json)
      rm --force $target
      ln -s $file $target
      { ok: true, current: "current", target: $target, model: (public-model (load-model $arg1) true) }
    }
    "fork" => {
      if ($arg1 | is-empty) or ($arg2 | is-empty) { usage }
      let source = (load-model $arg1)
      let target_dir = (active-work-root | path join models)
      mkdir $target_dir
      let target_file = ($target_dir | path join $"($arg2).json")
      let next = ($source | reject --optional model sourcePath name | upsert name $arg2 | upsert model_id (if $set_model_id == "" { $source.model_id } else { $set_model_id }))
      $next | to json --indent 2 | save -f $target_file
      { ok: true, source: $arg1, target: $arg2, path: $target_file, model: (public-model (normalize-model $next $target_file $arg2) true) }
    }
    _ => { usage }
  }
}
