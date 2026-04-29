export def roots [] {
  let configured = ($env.STRAP_MODEL_PATH? | default "" | split row ":" | where {|item| $item != "" })
  let session = if (($env.STRAP_SESSION? | default "") == "") { [] } else { [($env.STRAP_SESSION | path join overlay models)] }
  $configured | append $session | append [
    ($env.STRAP_WORK | path join models)
    ($env.STRAP_PROJECT | path join models)
    ($env.STRAP_GLOBAL | path join models)
    ($env.STRAP_ROOT | path join config strap models)
  ]
}

export def resolve [name: string] {
  if ($name | str ends-with ".json") or ($name | str contains "/") {
    let direct = ($name | path expand)
    if ($direct | path exists) { return $direct }
  }

  let file_name = if ($name | str ends-with ".json") { $name } else { $"($name).json" }
  for root in (roots) {
    let file = ($root | path join $file_name)
    if ($file | path exists) { return $file }
  }
  error make { msg: $"Model profile not found: ($name)" }
}

export def load [name: string] {
  let config = (open (resolve $name))
  $config
  | upsert api ($config.api? | default "messages")
  | upsert model $config.model_id
  | upsert base_url ($config.base_url? | default "https://api.anthropic.com/v1/messages")
  | upsert auth ($config.auth? | default { type: "anthropic_api_key", env: "ANTHROPIC_API_KEY" })
  | upsert parameters ($config.parameters? | default {})
}
