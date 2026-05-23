use state.nu

def provider-tool-name [name: string] { $name | str replace --all "." "__" }
def canonical-tool-name [name: string] { $name | str replace --all "__" "." }

def tool-spec [tool: record] {
  { name: (provider-tool-name $tool.name), description: $tool.description, input_schema: $tool.inputSchema }
}

def response-call [item: record] {
  {
    id: ($item.id? | default "")
    tool: (canonical-tool-name ($item.name? | default ""))
    input: ($item.input? | default {})
    provider: { type: "tool_use", id: ($item.id? | default "") }
  }
}

export def request [statev: record, config: record, toolv: list] {
  {
    model: $config.model
    max_tokens: ($config.max_tokens? | default ($config.parameters.max_tokens? | default 4096))
    system: (state actor-frame $statev)
    messages: ((state flatten $statev.root) | each {|event|
      { role: (if $event.from == "model" { "assistant" } else { "user" }), content: (state event-text $event) }
    })
    tools: ($toolv | each {|tool| tool-spec $tool })
  } | merge $config.parameters
}

export def response-event [response: record] {
  let text = (($response.content? | default []) | where type == "text" | get text? | str join "\n") | default ""
  let calls = (($response.content? | default []) | where type == "tool_use" | each {|item| response-call $item })
  let base = {
    type: "event"
    from: "model"
    to: (if ($calls | is-empty) { ["user"] } else { ["harness"] })
    kind: (if ($calls | is-empty) { "message" } else { "tool_request" })
    text: $text
    provider: { name: "anthropic.messages", id: $response.id, model: $response.model, usage: ($response.usage? | default null) }
  }
  if ($calls | is-empty) { $base } else { $base | insert calls $calls }
}
