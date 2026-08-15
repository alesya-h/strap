use str

fn value-or {|m key fallback|
  if (and (not-eq $m $nil) (has-key $m $key) (not-eq $m[$key] $nil)) { put $m[$key] } else { put $fallback }
}

fn merge {|left right|
  var out = $left
  keys $right | each {|key| set out = (assoc $out $key $right[$key]) }
  put $out
}

fn expand-home {|path|
  if (str:has-prefix $path '~/') { put $E:HOME'/'(str:trim-prefix $path '~/') } else { put $path }
}

fn secret {|auth default-env|
  var env-name = (value-or $auth env '')
  if (not-eq $env-name '') {
    var value = ''
    if (has-env $env-name) { set value = (get-env $env-name) }
    if (eq $value '') { fail 'Missing environment variable: '$env-name }
    put $value
    return
  }
  var direct = (value-or $auth value '')
  if (not-eq $direct '') { put $direct; return }
  var file = (value-or $auth file '')
  if (not-eq $file '') { str:trim-space (slurp < (expand-home $file)); return }
  var fallback = ''
  if (has-env $default-env) { set fallback = (get-env $default-env) }
  if (eq $fallback '') { fail 'Missing environment variable: '$default-env }
  put $fallback
}

fn post-json {|url headers body|
  var argv = [-sS -X POST $url -H 'content-type: application/json']
  each {|header| set argv = (conj $argv -H $header) } $headers
  set argv = (conj $argv -d @-)
  var curl = (external curl)
  var response = (put $body | to-json | $curl $@argv | from-json)
  if (has-key $response error) {
    var err = $response[error]
    if (and (eq (kind-of $err) map) (has-key $err message)) { fail $err[message] }
    fail $err
  }
  put $response
}
