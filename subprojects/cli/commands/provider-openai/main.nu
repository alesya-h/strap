#!/usr/bin/env nu

use lib/model.nu
use lib/state.nu
use lib/tools.nu

def usage [] {
  print -e "Usage: strap provider openai <compile|call|complete|embed> [args]"
  exit 2
}

def write-json [] {
  $in | to json --indent 2 | print
}

def get-env [name: string] {
  $env | get -o $name | default ""
}

def secret [auth: record] {
  if (($auth.env? | default "") != "") {
    let value = (get-env $auth.env)
    if ($value | is-empty) {
      error make { msg: $"Missing environment variable: ($auth.env)" }
    }
    return $value
  }

  if (($auth.value? | default "") != "") {
    return $auth.value
  }

  open --raw ($auth.file | path expand) | str trim
}

def read-input [file: string] {
  if $file == "-" { ^cat | from json } else { open $file }
}

def post-json [url: string, headers: list<string>, body: record] {
  ^curl -sS -X POST $url -H "content-type: application/json" ...$headers -d ($body | to json --raw) | from json
}

def response-event [response: record, api: string] {
  if $api == "chat" {
    let message = ($response.choices.0.message? | default {})
    return {
      from: "assistant"
      to: ["user"]
      kind: "message"
      text: ($message.content? | default "")
      provider: {
        name: "openai.chat"
        id: $response.id
        model: $response.model
        usage: ($response.usage? | default null)
      }
    }
  }

  {
    from: "assistant"
    to: ["user"]
    kind: "message"
    text: ($response.output_text? | default "")
    provider: {
      name: "openai.responses"
      id: $response.id
      model: $response.model
      usage: ($response.usage? | default null)
    }
  }
}

def compile-chat [statev: record, config: record, toolv: list] {
  {
    model: $config.model
    messages: (state chat-messages $statev)
    tools: ($toolv | each {|tool|
      {
        type: "function"
        function: {
          name: $tool.name
          description: $tool.description
          parameters: $tool.inputSchema
        }
      }
    })
  } | merge $config.parameters
}

def compile-responses [statev: record, config: record, toolv: list] {
  {
    model: $config.model
    instructions: (state actor-frame $statev)
    input: ((state flatten $statev.root) | each {|event| state event-text $event } | str join "\n\n")
    tools: ($toolv | each {|tool|
      {
        type: "function"
        name: $tool.name
        description: $tool.description
        parameters: $tool.inputSchema
      }
    })
  } | merge $config.parameters
}

def compile [statev: record, config: record, toolv: list] {
  if $config.api == "chat" {
    compile-chat $statev $config $toolv
  } else {
    compile-responses $statev $config $toolv
  }
}

def assert-provider [config: record] {
  if $config.provider != "openai" {
    error make { msg: $"Model profile provider mismatch: expected openai, got ($config.provider)" }
  }
}

def command-compile [model_name: string, tools_name: string, file: string] {
  let input_state = (read-input $file)
  let config = (model load $model_name)
  assert-provider $config
  compile $input_state $config (tools load $tools_name) | write-json
}

def command-call [model_name: string, tools_name: string, file: string] {
  let input_state = (read-input $file)
  let config = (model load $model_name)
  assert-provider $config
  let body = (compile $input_state $config (tools load $tools_name))
  post-json $config.base_url [$"Authorization: Bearer (secret $config.auth)"] $body | write-json
}

def command-complete [model_name: string, tools_name: string, file: string] {
  let input_state = (read-input $file)
  let config = (model load $model_name)
  assert-provider $config
  let body = (compile $input_state $config (tools load $tools_name))
  let response = (post-json $config.base_url [$"Authorization: Bearer (secret $config.auth)"] $body)
  $input_state | update root.children { append ({ type: "event" } | merge (response-event $response $config.api)) } | write-json
}

def command-embed [model_name: string, file: string, dimensions: string] {
  let raw = (read-input $file)
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

  let response = (post-json "https://api.openai.com/v1/embeddings" [
    $"Authorization: Bearer (secret { type: 'api_key', env: 'OPENAI_API_KEY' })"
  ] $body)

  {
    model: $body.model
    dimensions: (($response.data.0.embedding | length) | default 0)
    embeddings: ($response.data | each {|item| $item.embedding })
  } | write-json
}

def main [command?: string, --model: string = "current", --tools: string = "all", --file: string = "-", --dimensions: string = ""] {
  match ($command | default "") {
    "compile" => { command-compile $model $tools $file }
    "call" => { command-call $model $tools $file }
    "complete" => { command-complete $model $tools $file }
    "embed" => { command-embed $model $file $dimensions }
    _ => usage
  }
}
