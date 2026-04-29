use state.nu

def tool-spec [tool: record] {
  { type: "function", function: { name: $tool.name, description: $tool.description, parameters: $tool.inputSchema } }
}

export def request [statev: record, config: record, toolv: list] {
  {
    model: $config.model
    messages: ([{ role: "system", content: (state actor-frame $statev) }] | append ((state flatten $statev.root) | each {|event|
      { role: (if $event.from == "assistant" { "assistant" } else { "user" }), content: (state event-text $event) }
    }))
    tools: ($toolv | each {|tool| tool-spec $tool })
  } | merge $config.parameters
}

export def response-event [response: record] {
  let message = ($response.choices.0.message? | default {})
  {
    type: "event"
    from: "assistant"
    to: ["user"]
    kind: "message"
    text: ($message.content? | default "")
    provider: { name: "openrouter.chat", id: $response.id, model: $response.model, usage: ($response.usage? | default null) }
  }
}
