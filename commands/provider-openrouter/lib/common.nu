export def getenv [name: string] {
  $env | get -o $name | default ""
}

export def secret [auth: record] {
  let env_name = ($auth.env? | default "OPENROUTER_API_KEY")
  let value = (getenv $env_name)
  if ($value | is-empty) {
    error make { msg: $"Missing environment variable: ($env_name)" }
  }
  $value
}

export def post-json [url: string, headers: list<string>, body: record] {
  ^curl -sS -X POST $url -H "content-type: application/json" ...$headers -d ($body | to json --raw) | from json
}
