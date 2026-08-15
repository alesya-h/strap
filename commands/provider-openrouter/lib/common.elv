use str

fn value-or {|m key fallback|
  if (and (not-eq $m $nil) (has-key $m $key) (not-eq $m[$key] $nil)) {
    put $m[$key]
  } else {
    put $fallback
  }
}

fn merge {|left right|
  var out = $left
  keys $right | each {|key| set out = (assoc $out $key $right[$key]) }
  put $out
}

fn secret {|auth default-env|
  var env-name = (value-or $auth env $default-env)
  var value = ''
  if (has-env $env-name) { set value = (get-env $env-name) }
  if (eq $value '') { fail 'Missing environment variable: '$env-name }
  put $value
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
