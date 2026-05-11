export def getenv [name: string] {
  $env | get -o $name | default ""
}

export def secret [auth: record] {
  let env_name = ($auth.env? | default "ANTHROPIC_API_KEY")
  let value = (getenv $env_name)
  if ($value | is-empty) {
    error make { msg: $"Missing environment variable: ($env_name)" }
  }
  $value
}

export def post-json [url: string, headers: list<string>, body: record] {
  let curl_headers = ($headers | each {|header| ["-H", $header] } | flatten)
  let result = (^curl -sS -X POST $url -H "content-type: application/json" ...$curl_headers -d ($body | to json --raw) | complete)
  if $result.exit_code != 0 {
    error make { msg: ($result.stderr | default $result.stdout) }
  }
  let response = ($result.stdout | from json)
  if "error" in ($response | columns) {
    let err = $response.error
    error make { msg: ($err.message? | default ($err | to json --raw)) }
  }
  $response
}
