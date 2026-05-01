use state.nu

export def response-event [response: record, api: string] {
  if $api == "chat" {
    let message = ($response.choices.0.message? | default {})
    return {
      from: "assistant"
      to: ["user"]
      kind: "message"
      text: ($message.content? | default "")
      provider: { name: "openai.chat", id: $response.id, model: $response.model, usage: ($response.usage? | default null) }
    }
  }

  {
    from: "assistant"
    to: ["user"]
    kind: "message"
    text: ($response.output_text? | default "")
    provider: { name: "openai.responses", id: $response.id, model: $response.model, usage: ($response.usage? | default null) }
  }
}

def chat-tool [tool: record] {
  { type: "function", function: { name: $tool.name, description: $tool.description, parameters: $tool.inputSchema } }
}

def responses-tool [tool: record] {
  { type: "function", name: $tool.name, description: $tool.description, parameters: $tool.inputSchema }
}

def compile-chat [statev: record, config: record, toolv: list] {
  { model: $config.model, messages: (state chat-messages $statev), tools: ($toolv | each {|tool| chat-tool $tool }) } | merge $config.parameters
}

def compile-responses [statev: record, config: record, toolv: list] {
  {
    model: $config.model
    instructions: (state actor-frame $statev)
    input: ((state flatten $statev.root) | each {|event| state event-text $event } | str join "\n\n")
    tools: ($toolv | each {|tool| responses-tool $tool })
  } | merge $config.parameters
}

export def request [statev: record, config: record, toolv: list] {
  if $config.api == "chat" { compile-chat $statev $config $toolv } else { compile-responses $statev $config $toolv }
}
