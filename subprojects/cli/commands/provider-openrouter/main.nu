#!/usr/bin/env nu

def roots [] {
  let configured = ($env.STRAP_MODEL_PATH? | default "" | split row ":" | where {|item| $item != "" })
  let session = if (($env.STRAP_SESSION? | default "") == "") {
    []
  } else {
    [($env.STRAP_SESSION | path join overlay models)]
  }

  $configured
  | append $session
  | append [
      ($env.STRAP_WORK | path join models)
      ($env.STRAP_PROJECT | path join models)
      ($env.STRAP_GLOBAL | path join models)
      ($env.STRAP_ROOT | path join config strap models)
    ]
}

def resolve-model [name: string] {
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

def load-model [name: string] {
  let config = (open (resolve-model $name))

  $config
  | upsert api ($config.api? | default "chat")
  | upsert model $config.model_id
  | upsert base_url ($config.base_url? | default "https://openrouter.ai/api/v1/chat/completions")
  | upsert auth ($config.auth? | default { type: "api_key", env: "OPENROUTER_API_KEY" })
  | upsert parameters ($config.parameters? | default {})
}

def read-input [file: string] {
  if $file == "-" { ^cat | from json } else { open $file }
}

def write-json [] {
  $in | to json --indent 2 | print
}

def getenv [name: string] {
  $env | get -o $name | default ""
}

def secret [auth: record] {
  let env_name = ($auth.env? | default "OPENROUTER_API_KEY")
  let value = (getenv $env_name)
  if ($value | is-empty) {
    error make { msg: $"Missing environment variable: ($env_name)" }
  }
  $value
}

def actor-frame [state: record] {
  let actor = ($state.actors.assistant? | default {})
  mut sections = []

  if (($actor.self.public? | default "") != "") {
    $sections = ($sections | append $"<self_public>\n($actor.self.public)\n</self_public>")
  }

  if (($actor.self.private? | default "") != "") {
    $sections = ($sections | append $"<self_private>\n($actor.self.private)\n</self_private>")
  }

  for peer in (($actor.peers? | default {}) | transpose name rel) {
    if (($peer.rel.contract? | default "") != "") {
      $sections = ($sections | append $"<contract peer=\"($peer.name)\">\n($peer.rel.contract)\n</contract>")
    }
  }

  $sections | str join "\n\n"
}

def flatten [node: record] {
  if $node.type == "event" { return [$node] }

  if $node.type == "scope" {
    if (($node.status? | default "open") == "collapsed") {
      return [{
        type: "event"
        from: "harness"
        to: ($node.participants? | default [])
        kind: "summary"
        text: ($node.summary? | default $"[collapsed scope: ($node.label)]")
      }]
    }

    mut items = []
    for child in ($node.children? | default []) {
      $items = ($items | append (flatten $child))
    }
    return $items
  }

  []
}

def event-text [event: record] {
  let to = if (($event.to? | default []) | describe | str starts-with "list") {
    $event.to | str join ","
  } else {
    $event.to? | default "all"
  }

  [$"[($event.from) -> ($to); ($event.kind? | default 'message')]" ($event.text? | default "")]
  | str join "\n"
  | str trim
}

def tools [group: string] {
  if $group == "none" { return [] }

  let js = ([
    "import { getTools, publicToolSpec } from '#strap/tools/registry'; "
    "console.log(JSON.stringify(getTools("
    ($group | to json --raw)
    ").map(publicToolSpec)));"
  ] | str join "")

  ^node --input-type=module -e $js | from json
}

def compile [statev: record, config: record, toolv: list] {
  {
    model: $config.model
    messages: ([{ role: "system", content: (actor-frame $statev) }]
      | append ((flatten $statev.root) | each {|event|
          {
            role: (if $event.from == "assistant" { "assistant" } else { "user" })
            content: (event-text $event)
          }
        }))
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

def post-json [url: string, headers: list<string>, body: record] {
  ^curl -sS -X POST $url -H "content-type: application/json" ...$headers -d ($body | to json --raw) | from json
}

def response-event [response: record] {
  let message = ($response.choices.0.message? | default {})
  {
    type: "event"
    from: "assistant"
    to: ["user"]
    kind: "message"
    text: ($message.content? | default "")
    provider: {
      name: "openrouter.chat"
      id: $response.id
      model: $response.model
      usage: ($response.usage? | default null)
    }
  }
}

def usage [] {
  print -e "Usage: strap provider openrouter <compile|call|complete> [args]"
  exit 2
}

def prepare [model_name: string, tools_name: string, file: string] {
  let input_state = (read-input $file)
  let config = (load-model $model_name)
  if $config.provider != "openrouter" {
    error make { msg: $"Model profile provider mismatch: expected openrouter, got ($config.provider)" }
  }

  {
    state: $input_state
    config: $config
    body: (compile $input_state $config (tools $tools_name))
  }
}

def main [command?: string, --model: string = "current", --tools: string = "all", --file: string = "-"] {
  match ($command | default "") {
    "compile" => {
      let prepared = (prepare $model $tools $file)
      $prepared.body | write-json
    }
    "call" => {
      let prepared = (prepare $model $tools $file)
      post-json $prepared.config.base_url [$"Authorization: Bearer (secret $prepared.config.auth)"] $prepared.body | write-json
    }
    "complete" => {
      let prepared = (prepare $model $tools $file)
      let response = (post-json $prepared.config.base_url [$"Authorization: Bearer (secret $prepared.config.auth)"] $prepared.body)
      $prepared.state | update root.children { append (response-event $response) } | write-json
    }
    _ => usage
  }
}
