use state.nu

def tool-spec [tool: record] {
  { type: "function", function: { name: $tool.name, description: $tool.description, parameters: $tool.inputSchema } }
}

def parse-arguments [value: any] {
  let raw = ($value | default "{}")
  try { $raw | from json } catch { { raw: $raw } }
}

def response-call [call: record] {
  {
    id: ($call.id? | default "")
    tool: ($call.function.name? | default "")
    input: (parse-arguments ($call.function.arguments? | default "{}"))
    provider: { type: ($call.type? | default "function"), id: ($call.id? | default "") }
  }
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
  let calls = (($message.tool_calls? | default []) | each {|call| response-call $call })
  let base = {
    type: "event"
    from: "assistant"
    to: (if ($calls | is-empty) { ["user"] } else { ["harness"] })
    kind: (if ($calls | is-empty) { "message" } else { "tool_request" })
    text: ($message.content? | default "")
    provider: { name: "openrouter.chat", id: $response.id, model: $response.model, usage: ($response.usage? | default null) }
  }
  if ($calls | is-empty) { $base } else { $base | insert calls $calls }
}
