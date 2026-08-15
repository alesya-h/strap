use str
use ./lib/common
use ./lib/compile
use ./lib/model
use ./lib/tools

fn env-or {|name fallback|
  if (and (has-env $name) (not-eq (get-env $name) '')) { get-env $name } else { put $fallback }
}

fn assert-chat {|config|
  if (not-eq $config[provider] openrouter) { fail 'Model profile provider mismatch: expected openrouter, got '$config[provider] }
  if (not-eq $config[api] chat) { fail 'OpenRouter completion requires a chat model profile, got api='$config[api] }
}

fn prepare {|input model-name tools-name|
  var config = (model:load $model-name)
  assert-chat $config
  put [&state=$input &config=$config &body=(compile:request $input $config (tools:load $tools-name))]
}

fn embedding-config {|model-name|
  var selected = $model-name
  if (eq $selected current) {
    set selected = (env-or STRAP_OPENROUTER_EMBED_MODEL (env-or STRAP_EMBED_MODEL (env-or STRAP_ZK_EMBED_MODEL 'perplexity/pplx-embed-v1-0.6b')))
  }
  if (str:contains $selected /) {
    put [&model=$selected &base_url=https://openrouter.ai/api/v1/embeddings]
    return
  }
  var config = (model:load $selected)
  if (not-eq $config[provider] openrouter) { fail 'Model profile provider mismatch: expected openrouter, got '$config[provider] }
  if (not-eq $config[api] embeddings) { fail 'OpenRouter embeddings require an embeddings model profile, got api='$config[api] }
  put [&model=$config[model] &base_url=$config[base_url]]
}

fn command-embed {|input model-name|
  var texts = []
  if (has-key $input texts) { set texts = $input[texts] } elif (has-key $input text) { set texts = [$input[text]] } else { set texts = [''] }
  var embed = (embedding-config $model-name)
  var key = (common:secret [&env=OPENROUTER_API_KEY] OPENROUTER_API_KEY)
  var response = (common:post-json $embed[base_url] ['Authorization: Bearer '$key] [&model=$embed[model] &input=$texts &encoding_format=float])
  var embeddings = [(each {|item| put $item[embedding] } (common:value-or $response data []))]
  var dimensions = (num 0)
  if (> (count $embeddings) 0) { set dimensions = (count $embeddings[0]) }
  put [&model=$embed[model] &dimensions=$dimensions &embeddings=$embeddings]
}

fn main {|input command &model=current &tools=all|
  if (not (or (eq $command compile) (eq $command call) (eq $command complete) (eq $command embed))) {
    fail 'Usage: strap provider openrouter <compile|call|complete|embed> [args]'
  }
  if (eq $command embed) { command-embed $input $model; return }
  var prepared = (prepare $input $model $tools)
  if (eq $command compile) { put $prepared[body]; return }
  var key = (common:secret $prepared[config][auth] OPENROUTER_API_KEY)
  var response = (common:post-json $prepared[config][base_url] ['Authorization: Bearer '$key] $prepared[body])
  if (eq $command call) { put $response; return }
  if (eq $command complete) {
    var event = (compile:response-event $response)
    var active = (common:value-or (common:value-or $input runtime [&]) active_model model)
    set event = (assoc $event from $active)
    put (assoc $input history (conj (common:value-or $input history []) $event))
    return
  }
}
