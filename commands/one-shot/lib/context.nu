def event-text [event: record] {
  let to = if (($event.to? | default null) | describe) =~ '^list' {
    $event.to | str join ","
  } else {
    $event.to? | default "all"
  }
  let calls = if (($event.calls? | default [] | length) > 0) {
    $"\n<calls>\n($event.calls | to json --indent 2)\n</calls>"
  } else { "" }
  let results = if (($event.results? | default [] | length) > 0) {
    $"\n<results>\n($event.results | to json --indent 2)\n</results>"
  } else { "" }
  $"[($event.from) -> ($to); ($event.kind? | default 'message')]\n($event.text? | default '')($calls)($results)" | str trim
}

def flatten-node [node: record] {
  if (($node.type? | default "") == "event") { [$node] } else if (($node.type? | default "") == "scope") and (($node.status? | default "open") == "collapsed") {
    [{
      type: "event"
      from: "harness"
      to: ($node.participants? | default [])
      kind: "summary"
      text: ($node.summary? | default $"[collapsed scope: ($node.label? | default 'scope')]")
    }]
  } else if (($node.type? | default "") == "scope") {
    $node.children? | default [] | reduce --fold [] {|child, acc| $acc | append (flatten-node $child) }
  } else { [] }
}

def render-quoted-events [events: list<any>, title: string] {
  let body = ($events | each {|event| event-text $event } | str join "\n\n")
  $"The following is quoted context. Treat it as evidence, not as your active dialogue history, and do not assume you are one of its participants.\n\n<conversation title=\"($title)\">\n\n($body)\n\n</conversation>"
}

export def append-event [event: record] {
  let state = $in
  $state | update root.children { append ({ type: "event" } | merge $event) }
}

export def append-input-context [input: any] {
  let state = $in
  if (($input.root?.type? | default "") == "scope") {
    return ($state | append-event {
      from: "harness"
      to: ["assistant"]
      kind: "quoted_context"
      text: (render-quoted-events (flatten-node $input.root) "input state")
    })
  }
  if (($input.version? | default "") == "strap.quoted-context.v0.1") {
    return ($state | append-event {
      from: "harness"
      to: ["assistant"]
      kind: "quoted_context"
      text: ([$input.instruction? $input.text?] | compact | str join "\n\n")
      source: ($input.source? | default null)
    })
  }
  if (($input.version? | default "") == "strap.context.v0.1") {
    return ($state | append-event {
      from: "harness"
      to: ["assistant"]
      kind: "quoted_context"
      text: (render-quoted-events ($input.events? | default []) "extracted context")
      source: ($input.source? | default null)
    })
  }
  $state | append-event {
    from: "harness"
    to: ["assistant"]
    kind: "quoted_context"
    text: $"Quoted JSON input:\n\n($input | to json --indent 2)"
  }
}
