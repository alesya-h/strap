use ./lib/common
use ./lib/compile
use ./lib/model
use ./lib/tools

fn headers {|config|
  var key = (common:secret $config[auth] ANTHROPIC_API_KEY)
  put ['x-api-key: '$key 'anthropic-version: '(common:value-or $config anthropic_version 2023-06-01)]
}

fn prepare {|input model-name tools-name|
  var config = (model:load $model-name)
  if (not-eq $config[provider] anthropic) { fail 'Model profile provider mismatch: expected anthropic, got '$config[provider] }
  put [&state=$input &config=$config &body=(compile:request $input $config (tools:load $tools-name))]
}

fn main {|input command &model=current &tools=all|
  if (not (or (eq $command compile) (eq $command call) (eq $command complete))) {
    fail 'Usage: strap provider anthropic <compile|call|complete> [args]'
  }
  var prepared = (prepare $input $model $tools)
  if (eq $command compile) { put $prepared[body]; return }
  var response = (common:post-json $prepared[config][base_url] (headers $prepared[config]) $prepared[body])
  if (eq $command call) { put $response; return }
  if (eq $command complete) {
    var event = (compile:response-event $response)
    var runtime = (common:value-or $input runtime [&])
    set event = (assoc $event from (common:value-or $runtime active_model model))
    put (assoc $input history (conj (common:value-or $input history []) $event))
    return
  }
}
