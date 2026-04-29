export def read-input [file: string] {
  if $file == "-" { ^cat | from json } else { open $file }
}

export def write-json [] {
  $in | to json --indent 2 | print
}

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
  ^curl -sS -X POST $url -H "content-type: application/json" ...$headers -d ($body | to json --raw) | from json
}
