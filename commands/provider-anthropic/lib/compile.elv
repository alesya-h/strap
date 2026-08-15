use ./common
use ./state
use str

fn provider-tool-name {|name| str:replace . __ $name }
fn canonical-tool-name {|name| str:replace __ . $name }

fn tool-spec {|tool|
  put [&name=(provider-tool-name $tool[name])
       &description=(common:value-or $tool description '')
       &input_schema=(common:value-or $tool inputSchema [&])]
}

fn response-call {|item|
  var id = (common:value-or $item id '')
  put [&id=$id
       &tool=(canonical-tool-name (common:value-or $item name ''))
       &input=(common:value-or $item input [&])
       &provider=[&type=tool_use &id=$id]]
}

fn request {|statev config toolv|
  var parameters = (common:value-or $config parameters [&])
  var max-tokens = (common:value-or $config max_tokens (common:value-or $parameters max_tokens (num 4096)))
  var messages = [(each {|event|
    put [&role=(state:provider-role $statev $event) &content=(state:event-text $event)]
  } (state:history $statev))]
  var specs = [(each {|tool| tool-spec $tool } $toolv)]
  var body = [&model=$config[model]
              &max_tokens=$max-tokens
              &system=(state:actor-frame $statev)
              &messages=$messages
              &tools=$specs]
  common:merge $body $parameters
}

fn response-event {|response|
  var text-items = [(each {|item|
    if (eq (common:value-or $item type '') text) { put (common:value-or $item text '') }
  } (common:value-or $response content []))]
  var calls = [(each {|item|
    if (eq (common:value-or $item type '') tool_use) { response-call $item }
  } (common:value-or $response content []))]
  var base = [&from=model
              &text=(str:join "\n" $text-items)
              &provider=[&name=anthropic.messages
                         &id=(common:value-or $response id '')
                         &model=(common:value-or $response model '')
                         &usage=(common:value-or $response usage $nil)]]
  if (> (count $calls) 0) { set base = (assoc $base calls $calls) }
  put $base
}
