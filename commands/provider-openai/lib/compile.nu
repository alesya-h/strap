use state.nu

def parse-arguments [value: any] {
  let raw = ($value | default "{}")
  try { $raw | from json } catch { { raw: $raw } }
}

def chat-call [call: record] {
  {
    id: ($call.id? | default "")
    tool: ($call.function.name? | default "")
    input: (parse-arguments ($call.function.arguments? | default "{}"))
    provider: { type: ($call.type? | default "function"), id: ($call.id? | default "") }
  }
}

def responses-call [item: record] {
  {
    id: ($item.call_id? | default ($item.id? | default ""))
    tool: ($item.name? | default "")
    input: (parse-arguments ($item.arguments? | default "{}"))
    provider: { type: ($item.type? | default "function_call"), id: ($item.id? | default ""), call_id: ($item.call_id? | default "") }
  }
}

def event-base [response: record, provider_name: string, text: string, calls: list] {
  let base = {
    from: "assistant"
    to: (if ($calls | is-empty) { ["user"] } else { ["harness"] })
    kind: (if ($calls | is-empty) { "message" } else { "tool_request" })
    text: $text
    provider: { name: $provider_name, id: $response.id, model: $response.model, usage: ($response.usage? | default null) }
  }
  if ($calls | is-empty) { $base } else { $base | insert calls $calls }
}

export def response-event [response: record, api: string] {
  if $api == "chat" {
    let message = ($response.choices.0.message? | default {})
    let calls = (($message.tool_calls? | default []) | each {|call| chat-call $call })
    return (event-base $response "openai.chat" ($message.content? | default "") $calls)
  }

  let calls = (($response.output? | default []) | where type == "function_call" | each {|item| responses-call $item })
  event-base $response "openai.responses" ($response.output_text? | default "") $calls
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
