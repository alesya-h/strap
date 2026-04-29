use common.nu

export def command [model_name: string, file: string, dimensions: string] {
  let raw = (common read-input $file)
  let texts = ($raw.texts? | default [($raw.text? | default "")])
  let embed_model = if $model_name == "current" {
    $env.STRAP_EMBED_MODEL? | default ($env.STRAP_ZK_EMBED_MODEL? | default "text-embedding-3-small")
  } else {
    $model_name
  }

  mut body = { model: $embed_model, input: $texts }
  if $dimensions != "" {
    $body = ($body | insert dimensions ($dimensions | into int))
  }

  let response = (common post-json "https://api.openai.com/v1/embeddings" [
    $"Authorization: Bearer (common secret { type: 'api_key', env: 'OPENAI_API_KEY' })"
  ] $body)

  {
    model: $body.model
    dimensions: (($response.data.0.embedding | length) | default 0)
    embeddings: ($response.data | each {|item| $item.embedding })
  } | common write-json
}
