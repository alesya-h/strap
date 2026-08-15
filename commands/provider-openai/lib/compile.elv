use ./common
use ./state
use str

fn provider-tool-name {|name| str:replace . __ $name }
fn canonical-tool-name {|name| str:replace __ . $name }

fn parse-arguments {|raw|
  try { echo $raw | from-json } catch _ { put [&raw=$raw] }
}

fn chat-call {|call|
  var function = (common:value-or $call function [&])
  var id = (common:value-or $call id '')
  put [&id=$id
       &tool=(canonical-tool-name (common:value-or $function name ''))
       &input=(parse-arguments (common:value-or $function arguments '{}'))
       &provider=[&type=(common:value-or $call type function) &id=$id]]
}

fn responses-call {|item|
  var id = (common:value-or $item id '')
  var call-id = (common:value-or $item call_id $id)
  put [&id=$call-id
       &tool=(canonical-tool-name (common:value-or $item name ''))
       &input=(parse-arguments (common:value-or $item arguments '{}'))
       &provider=[&type=(common:value-or $item type function_call) &id=$id &call_id=$call-id]]
}

fn event-base {|response provider-name text calls|
  var base = [&from=model &text=$text &provider=[
    &name=$provider-name
    &id=(common:value-or $response id '')
    &model=(common:value-or $response model '')
    &usage=(common:value-or $response usage $nil)]]
  if (> (count $calls) 0) { set base = (assoc $base calls $calls) }
  put $base
}

fn response-event {|response api|
  if (eq $api chat) {
    var choices = (common:value-or $response choices [])
    var message = [&]
    if (> (count $choices) 0) { set message = (common:value-or $choices[0] message [&]) }
    var calls = [(each {|call| chat-call $call } (common:value-or $message tool_calls []))]
    event-base $response openai.chat (common:value-or $message content '') $calls
    return
  }
  var calls = [(each {|item|
    if (eq (common:value-or $item type '') function_call) { responses-call $item }
  } (common:value-or $response output []))]
  event-base $response openai.responses (common:value-or $response output_text '') $calls
}

fn chat-tool {|tool|
  put [&type=function &function=[
    &name=(provider-tool-name $tool[name])
    &description=(common:value-or $tool description '')
    &parameters=(common:value-or $tool inputSchema [&])]]
}

fn responses-tool {|tool|
  put [&type=function
       &name=(provider-tool-name $tool[name])
       &description=(common:value-or $tool description '')
       &parameters=(common:value-or $tool inputSchema [&])]
}

fn request {|statev config toolv|
  var specs = []
  var body = [&]
  if (eq $config[api] chat) {
    set specs = [(each {|tool| chat-tool $tool } $toolv)]
    set body = [&model=$config[model] &messages=(state:chat-messages $statev) &tools=$specs]
  } else {
    set specs = [(each {|tool| responses-tool $tool } $toolv)]
    var inputs = [(each {|event| state:event-text $event } (state:history $statev))]
    set body = [&model=$config[model]
                &instructions=(state:actor-frame $statev)
                &input=(str:join "\n\n" $inputs)
                &tools=$specs]
  }
  common:merge $body (common:value-or $config parameters [&])
}
