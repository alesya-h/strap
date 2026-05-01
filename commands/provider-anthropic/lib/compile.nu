use state.nu

def tool-spec [tool: record] {
  { name: $tool.name, description: $tool.description, input_schema: $tool.inputSchema }
}

export def request [statev: record, config: record, toolv: list] {
  {
    model: $config.model
    max_tokens: ($config.max_tokens? | default ($config.parameters.max_tokens? | default 4096))
    system: (state actor-frame $statev)
    messages: ((state flatten $statev.root) | each {|event|
      { role: (if $event.from == "assistant" { "assistant" } else { "user" }), content: (state event-text $event) }
    })
    tools: ($toolv | each {|tool| tool-spec $tool })
  } | merge $config.parameters
}

export def response-event [response: record] {
  let text = (($response.content? | default []) | where type == "text" | get text? | str join "\n") | default ""
  {
    type: "event"
    from: "assistant"
    to: ["user"]
    kind: "message"
    text: $text
    provider: { name: "anthropic.messages", id: $response.id, model: $response.model, usage: ($response.usage? | default null) }
  }
}
