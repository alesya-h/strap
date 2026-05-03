export def get-env [name: string] {
  $env | get -o $name | default ""
}

export def secret [auth: record] {
  if (($auth.env? | default "") != "") {
    let value = (get-env $auth.env)
    if ($value | is-empty) {
      error make { msg: $"Missing environment variable: ($auth.env)" }
    }
    return $value
  }

  if (($auth.value? | default "") != "") {
    return $auth.value
  }

  open --raw ($auth.file | path expand) | str trim
}

export def post-json [url: string, headers: list<string>, body: record] {
  ^curl -sS -X POST $url -H "content-type: application/json" ...$headers -d ($body | to json --raw) | from json
}
