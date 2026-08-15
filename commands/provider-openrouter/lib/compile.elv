use ./common
use ./state
use str

fn provider-tool-name {|name| str:replace . __ $name }
fn canonical-tool-name {|name| str:replace __ . $name }

fn tool-spec {|tool|
  put [&type=function &function=[
    &name=(provider-tool-name $tool[name])
    &description=(common:value-or $tool description '')
    &parameters=(common:value-or $tool inputSchema [&])]]
}

fn parse-arguments {|raw|
  try { echo (common:value-or [&raw=$raw] raw '{}') | from-json } catch _ { put [&raw=$raw] }
}

fn response-call {|call|
  var function = (common:value-or $call function [&])
  var id = (common:value-or $call id '')
  put [&id=$id
       &tool=(canonical-tool-name (common:value-or $function name ''))
       &input=(parse-arguments (common:value-or $function arguments '{}'))
       &provider=[&type=(common:value-or $call type function) &id=$id]]
}

fn request {|statev config toolv|
  var messages = [[&role=system &content=(state:actor-frame $statev)]]
  each {|event|
    set messages = (conj $messages [&role=(state:provider-role $statev $event) &content=(state:event-text $event)])
  } (state:history $statev)
  var specs = [(each {|tool| tool-spec $tool } $toolv)]
  var body = [&model=$config[model] &messages=$messages &tools=$specs]
  common:merge $body (common:value-or $config parameters [&])
}

fn response-event {|response|
  var choices = (common:value-or $response choices [])
  var message = [&]
  if (> (count $choices) 0) { set message = (common:value-or $choices[0] message [&]) }
  var calls = [(each {|call| response-call $call } (common:value-or $message tool_calls []))]
  var base = [&from=model
              &text=(common:value-or $message content '')
              &provider=[&name=openrouter.chat
                         &id=(common:value-or $response id '')
                         &model=(common:value-or $response model '')
                         &usage=(common:value-or $response usage $nil)]]
  if (> (count $calls) 0) { set base = (assoc $base calls $calls) }
  put $base
}
