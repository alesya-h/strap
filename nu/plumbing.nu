# Stable immutable state plumbing for strap.
# Porcelain should prefer these primitives instead of hand-editing state shape.

export def init [] {
  {
    version: "strap.state.v0.2"
    actors: {
      user: {
        kind: "human"
        self: { public: "The user driving the work." }
        peers: { assistant: { contract: "Collaborate directly, preserve user intent, ask only when blocked." } }
      }
      assistant: {
        kind: "agent"
        self: {
          public: "A pragmatic software agent operating a unix-ish harness."
          private: "Keep provider-specific state out of canonical state; compile requests from this file."
        }
        peers: {
          user: { contract: "Solve the task end-to-end when feasible; keep updates concise." }
          harness: { contract: "Use tool calls as structured actor communication." }
        }
      }
      harness: {
        kind: "runtime"
        self: { public: "The local execution harness, MCP bridge, and provider adapter." }
        peers: { assistant: { contract: "Execute approved calls, report visible output, keep retained hidden state available." } }
      }
    }
    root: {
      type: "scope"
      label: "root"
      status: "open"
      participants: [user assistant harness]
      children: []
    }
  }
}

export def append-event [from: string, to: list<string>, kind: string, text: string = ""] {
  let state = $in
  let event = { type: "event", from: $from, to: $to, kind: $kind, text: $text }
  $state | update root.children { |children| $children | append $event }
}

export def add-user [text: string] {
  $in | append-event user [assistant] message $text
}

export def add-assistant [text: string] {
  $in | append-event assistant [user] message $text
}

export def add-tool-request [tool: string, input: record] {
  let state = $in
  let event = {
    type: "event"
    from: "assistant"
    to: [harness]
    kind: "tool_request"
    text: ""
    calls: [{ tool: $tool, input: $input }]
  }
  $state | update root.children { |children| $children | append $event }
}

export def open-scope [label: string] {
  let state = $in
  let scope = { type: "scope", label: $label, status: "open", participants: [assistant harness], children: [] }
  $state | update root.children { |children| $children | append $scope }
}

export def collapse-last-scope [summary: string] {
  let state = $in
  let children = ($state.root.children)
  let indexed = ($children | enumerate)
  let open = ($indexed | where item.type == scope and item.status == open | last)
  if ($open == null) { error make { msg: "No open scope found" } }
  let collapsed = ($open.item | merge { status: "collapsed", summary: $summary, hidden: { children: $open.item.children }, children: [] })
  $state | update root.children { |items| $items | update $open.index $collapsed }
}

export def last-assistant-text [] {
  $in.root.children
  | where type == event and from == assistant and text != ""
  | last
  | get text
}

export def add-trace [kind: string, data: any] {
  let state = $in
  let trace = { at: (date now | into string), kind: $kind, data: $data }
  if ("trace" in ($state | columns)) {
    $state | update trace { |items| $items | append $trace }
  } else {
    $state | insert trace [$trace]
  }
}
