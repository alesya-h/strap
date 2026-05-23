use state.nu

def provider-tool-name [name: string] { $name | str replace --all "." "__" }
def canonical-tool-name [name: string] { $name | str replace --all "__" "." }

def tool-spec [tool: record] {
  { type: "function", function: { name: (provider-tool-name $tool.name), description: $tool.description, parameters: $tool.inputSchema } }
}

def parse-arguments [value: any] {
  let raw = ($value | default "{}")
  try { $raw | from json } catch { { raw: $raw } }
}

def response-call [call: record] {
  {
    id: ($call.id? | default "")
    tool: (canonical-tool-name ($call.function.name? | default ""))
    input: (parse-arguments ($call.function.arguments? | default "{}"))
    provider: { type: ($call.type? | default "function"), id: ($call.id? | default "") }
  }
}

export def request [statev: record, config: record, toolv: list] {
  {
    model: $config.model
    messages: ([{ role: "system", content: (state actor-frame $statev) }] | append ((state history $statev) | each {|event|
      { role: (state provider-role $statev $event), content: (state event-text $event) }
    }))
    tools: ($toolv | each {|tool| tool-spec $tool })
  } | merge $config.parameters
}

export def response-event [response: record] {
  let message = ($response.choices.0.message? | default {})
  let calls = (($message.tool_calls? | default []) | each {|call| response-call $call })
  let base = {
    from: "model"
    text: ($message.content? | default "")
    provider: { name: "openrouter.chat", id: $response.id, model: $response.model, usage: ($response.usage? | default null) }
  }
  if ($calls | is-empty) { $base } else { $base | insert calls $calls }
}
