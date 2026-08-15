use ./lib/common
use ./lib/compile
use ./lib/model
use ./lib/tools

fn env-or {|name fallback|
  if (and (has-env $name) (not-eq (get-env $name) '')) { get-env $name } else { put $fallback }
}

fn prepare {|input model-name tools-name|
  var config = (model:load $model-name)
  if (not-eq $config[provider] openai) { fail 'Model profile provider mismatch: expected openai, got '$config[provider] }
  put [&state=$input &config=$config &body=(compile:request $input $config (tools:load $tools-name))]
}

fn command-embed {|input model-name dimensions|
  var texts = []
  if (has-key $input texts) { set texts = $input[texts] } elif (has-key $input text) { set texts = [$input[text]] } else { set texts = [''] }
  var selected = $model-name
  if (eq $selected current) { set selected = (env-or STRAP_EMBED_MODEL (env-or STRAP_ZK_EMBED_MODEL text-embedding-3-small)) }
  var body = [&model=$selected &input=$texts]
  if (not-eq $dimensions '') { set body = (assoc $body dimensions (num $dimensions)) }
  var key = (common:secret [&env=OPENAI_API_KEY] OPENAI_API_KEY)
  var response = (common:post-json https://api.openai.com/v1/embeddings ['Authorization: Bearer '$key] $body)
  var embeddings = [(each {|item| put $item[embedding] } (common:value-or $response data []))]
  var size = (num 0)
  if (> (count $embeddings) 0) { set size = (count $embeddings[0]) }
  put [&model=$selected &dimensions=$size &embeddings=$embeddings]
}

fn main {|input command &model=current &tools=all &dimensions=''|
  if (not (or (eq $command compile) (eq $command call) (eq $command complete) (eq $command embed))) {
    fail 'Usage: strap provider openai <compile|call|complete|embed> [args]'
  }
  if (eq $command embed) { command-embed $input $model $dimensions; return }
  var prepared = (prepare $input $model $tools)
  if (eq $command compile) { put $prepared[body]; return }
  var key = (common:secret $prepared[config][auth] OPENAI_API_KEY)
  var response = (common:post-json $prepared[config][base_url] ['Authorization: Bearer '$key] $prepared[body])
  if (eq $command call) { put $response; return }
  if (eq $command complete) {
    var event = (compile:response-event $response $prepared[config][api])
    var runtime = (common:value-or $input runtime [&])
    set event = (assoc $event from (common:value-or $runtime active_model model))
    put (assoc $input history (conj (common:value-or $input history []) $event))
    return
  }
}
