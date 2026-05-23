export def strap-bin [] { $env.STRAP_BIN? | default (($env.STRAP_ROOT? | default (pwd)) | path join bin strap) }

export def argv [args: list<any>] { $args | each {|arg| $arg | into string } }

export def fail [msg: string] { print -e $"FAIL: ($msg)"; exit 1 }

export def ok [condition: bool, msg: string] { if not $condition { fail $msg } }

export def has [text: string, needle: string, msg: string] { ok ($text | str contains $needle) $msg }

export def non-empty [value: any, msg: string] { ok (($value | into string | str length) > 0) $msg }

export def skip [msg: string] { print $"SKIP: ($msg)"; exit 77 }

export def paid-only [msg: string] {
  if (($env.STRAP_WITH_PAID_PROVIDERS? | default "") != "1") { skip $msg }
}

export def call [args: list<any>] {
  let result = (run-external (strap-bin) ...(argv $args) | complete)
  ok ($result.exit_code == 0) $"strap ($args | str join ' ') failed\nstdout:\n($result.stdout)\nstderr:\n($result.stderr)"
  $result.stdout
}

export def call-json [args: list<any>] { call $args | from json }

export def pipe-call [args: list<any>] {
  let value = $in
  let result = ($value | to json | run-external (strap-bin) ...(argv $args) | complete)
  ok ($result.exit_code == 0) $"strap ($args | str join ' ') failed\nstdout:\n($result.stdout)\nstderr:\n($result.stderr)"
  $result.stdout
}

export def pipe-json [args: list<any>] { $in | pipe-call $args | from json }

export def state-with-user [text: string] { call-json [state init] | pipe-json [state add-user $text] }

export def case-tmp [] {
  let dir = ($env.STRAP_TEST_CASE_TMP? | default "/tmp/strap-test-case")
  mkdir $dir
  $dir
}

export def tool-state [tool: string, input: record] {
  {
    version: "strap.state.v0.4"
    actors: { model: { kind: "model" } }
    runtime: { active_model: "model" }
    history: [{ from: "model", calls: [{ id: "test", tool: $tool, input: $input }] }]
  }
}

export def tool-call [group: string, tool: string, input: record] {
  let next = (tool-state $tool $input | pipe-json [run-calls --tools $group])
  $next.history.0.calls.0
}

export def tool-output [group: string, tool: string, input: record] {
  let call = (tool-call $group $tool $input)
  ok ($call.ok == true) $"tool ($tool) failed: ($call.error? | default '')"
  $call.output
}
