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
  let entry = { type: "event", from: $from, to: $to, kind: $kind, text: $text }
  $state | update root.children { append $entry }
}

export def add-user [text: string] {
  $in | append-event user [assistant] message $text
}

export def add-assistant [text: string] {
  $in | append-event assistant [user] message $text
}

export def add-tool-request [tool: string, input: record] {
  let state = $in
  let entry = {
    type: "event"
    from: "assistant"
    to: [harness]
    kind: "tool_request"
    text: ""
    calls: [{ tool: $tool, input: $input }]
  }
  $state | update root.children { append $entry }
}

export def open-scope [label: string] {
  let state = $in
  let scope = { type: "scope", label: $label, status: "open", participants: [assistant harness], children: [] }
  $state | update root.children { append $scope }
}

export def collapse-last-scope [summary: string] {
  let state = $in
  let children = ($state.root.children)
  let indexed = ($children | enumerate)
  let open = ($indexed | where item.type == scope and item.status == open | last)
  if ($open == null) { error make { msg: "No open scope found" } }
  let collapsed = ($open.item | merge { status: "collapsed", summary: $summary, hidden: { children: $open.item.children }, children: [] })
  $state | update root.children { update $open.index $collapsed }
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
    $state | update trace { append $trace }
  } else {
    $state | insert trace [$trace]
  }
}

def node-participants [node: record] {
  [
    ($node.from? | default null)
    ...($node.to? | default [])
    ...($node.participants? | default [])
  ] | where {|item| $item != null } | uniq
}

def node-search-text [node: record] {
  [
    ($node.text? | default "")
    ($node.summary? | default "")
    ($node.label? | default "")
  ] | where {|item| $item != "" } | str join "\n"
}

def bookmark-id [bookmark: any] {
  if (($bookmark | describe) == "string") {
    $bookmark
  } else {
    $bookmark.id? | default null
  }
}

def bookmark-ids [node: record] {
  $node.bookmarks?
  | default []
  | each {|bookmark| bookmark-id $bookmark }
  | where {|id| $id != null }
}

def has-bookmark [id: string] {
  let node = $in
  bookmark-ids $node | any {|bookmark| $bookmark == $id }
}

def describe-node [node: record] {
  {
    type: ($node.type? | default null)
    kind: ($node.kind? | default null)
    from: ($node.from? | default null)
    to: ($node.to? | default null)
    label: ($node.label? | default null)
    status: ($node.status? | default null)
    excerpt: ((node-search-text $node) | str substring 0..160)
  }
}

def walk-node [node: record, path: string, hidden: bool] {
  let current = [($node | merge { _path: $path, _hidden: $hidden })]
  if (($node.type? | default "") != "scope") {
    $current
  } else {
    let children = (
      $node.children?
      | default []
      | enumerate
      | reduce --fold [] {|entry, acc|
          $acc | append (walk-node $entry.item $"($path).children[($entry.index)]" $hidden)
        }
    )
    let hidden_children = (
      $node.hidden?.children?
      | default []
      | enumerate
      | reduce --fold [] {|entry, acc|
          $acc | append (walk-node $entry.item $"($path).hidden.children[($entry.index)]" true)
        }
    )
    $current | append $children | append $hidden_children
  }
}

def flatten-visible-node [node: record, path: string] {
  if (($node.type? | default "") == "event") {
    [($node | merge { _path: $path })]
  } else if (($node.type? | default "") == "scope") and (($node.status? | default "open") == "collapsed") {
    [{
      type: event
      from: harness
      to: ($node.participants? | default [])
      kind: summary
      text: ($node.summary? | default $"[collapsed scope: ($node.label? | default 'scope')]")
      _path: $path
      _source_scope: ($node.label? | default null)
    }]
  } else if (($node.type? | default "") == "scope") {
    $node.children?
    | default []
    | enumerate
    | reduce --fold [] {|entry, acc|
        $acc | append (flatten-visible-node $entry.item $"($path).children[($entry.index)]")
      }
  } else {
    []
  }
}

export def walk [--hidden] {
  let state = $in
  let visible = (
    $state.root.children
    | enumerate
    | reduce --fold [] {|entry, acc|
        $acc | append (walk-node $entry.item $"root.children[($entry.index)]" false)
      }
  )
  if $hidden { $visible } else { $visible | where _hidden == false }
}

export def events [] {
  let state = $in
  $state.root.children
  | enumerate
  | reduce --fold [] {|entry, acc|
      $acc | append (flatten-visible-node $entry.item $"root.children[($entry.index)]")
    }
}

export def with-events [block: closure] {
  let state = $in
  do $block ($state | events)
}

export def map-events [block: closure] {
  $in | events | each {|event| do $block $event }
}

export def where-events [block: closure] {
  $in | events | where {|event| do $block $event }
}

export def bookmarks [--hidden] {
  $in
  | walk --hidden=$hidden
  | reduce --fold [] {|match, acc|
      $acc | append (
        $match.bookmarks?
        | default []
        | each {|bookmark|
            let id = (bookmark-id $bookmark)
            if (($bookmark | describe) == "string") {
              { id: $id, path: $match._path, hidden: $match._hidden, node: (describe-node $match) }
            } else {
              $bookmark | merge { path: $match._path, hidden: $match._hidden, node: (describe-node $match) }
            }
          }
      )
    }
}

export def locate-text [text: string, --hidden] {
  let matches = ($in | walk --hidden=$hidden | where {|match| (node-search-text $match) =~ $text })
  if (($matches | length) == 0) { error make { msg: $"No text match found: ($text)" } }
  if (($matches | length) > 1) { error make { msg: $"Ambiguous text match \((($matches | length)) matches\): ($text)" } }
  let match = ($matches | first)
  { path: $match._path, hidden: $match._hidden, node: (describe-node $match), bookmarks: (bookmark-ids $match) }
}

export def locate-bookmark [id: string, --hidden] {
  let matches = ($in | walk --hidden=$hidden | where {|match| $match | has-bookmark $id })
  if (($matches | length) == 0) { error make { msg: $"Bookmark not found: ($id)" } }
  if (($matches | length) > 1) { error make { msg: $"Duplicate bookmark found: ($id)" } }
  let match = ($matches | first)
  { path: $match._path, hidden: $match._hidden, node: (describe-node $match), bookmarks: (bookmark-ids $match) }
}

export def extract-range [from: string, to: string] {
  let state = $in
  let visible = ($state | events | enumerate)
  let start = ($visible | where {|entry| $entry.item | has-bookmark $from } | first)
  let end = ($visible | where {|entry| $entry.item | has-bookmark $to } | first)
  if ($start == null) { error make { msg: $"Bookmark not found: ($from)" } }
  if ($end == null) { error make { msg: $"Bookmark not found: ($to)" } }
  let first = (if $start.index < $end.index { $start.index } else { $end.index })
  let last = (if $start.index > $end.index { $start.index } else { $end.index })
  let items = ($visible | slice $first..$last | each {|entry| $entry.item })
  {
    version: strap.context.v0.1
    source: {
      state_version: $state.version
      from: $from
      to: $to
      path_from: $start.item._path
      path_to: $end.item._path
    }
    nodes: $items
    events: $items
  }
}

export def with-extract [from: string, to: string, block: closure] {
  let context = ($in | extract-range $from $to)
  do $block $context
}

export def update-actor [actor_id: string, block: closure] {
  let state = $in
  let actor = ($state.actors | get $actor_id)
  $state | update actors { upsert $actor_id (do $block $actor) }
}
