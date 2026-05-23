use bookmark.nu
use common.nu
use init.nu [state]
use range.nu
use render.nu
use walk.nu

export def init [] {
  state
}

export def append-event [from: string, to: list<string>, kind: string, text: string = ""] {
  $in | common append-event { from: $from, to: $to, kind: $kind, text: $text }
}

export def add-user [text: string] {
  $in | common append-event { from: "user", kind: "message", text: $text }
}

export def add-model [text: string] {
  let state = $in
  let agent = ($state | get --optional runtime.active_agent | default "")
  let event = { from: "model", kind: "message", text: $text }
  $state | common append-event (if $agent == "" { $event } else { $event | insert agent $agent })
}

export def push [label: string] {
  $in | update root.children {
    append { type: "scope", label: $label, status: "open", participants: ["model", "harness"], children: [] }
  }
}

export def pop [summary: string] {
  let state = $in
  let indexed = ($state.root.children | enumerate)
  let open = ($indexed | where {|entry| $entry.item.type == "scope" and $entry.item.status == "open" } | last)
  if ($open | is-empty) { error make { msg: "No open scope found" } }

  let collapsed = ($open.item | merge {
    status: "collapsed"
    summary: $summary
    hidden: { children: $open.item.children }
    children: []
  })
  $state | update root.children { update $open.index $collapsed }
}

export def bookmark-list [--hidden] {
  $in | bookmark list $hidden
}

export def bookmark-add [--text: string, --label: string = "", --id: string = "", --created-by: string = "model"] {
  let state = $in
  let bookmark_id = if $id == "" {
    $"bm_((date now | format date '%s'))_((random uuid) | str substring 0..3)"
  } else {
    $id
  }
  let base = { id: $bookmark_id, created_by: $created_by, created_at: (date now | into string) }
  let bookmark_value = if $label == "" { $base } else { $base | insert label $label }
  $state | bookmark add-root $text $bookmark_value
}

export def bookmark-remove [id: string] {
  $in | bookmark remove-root $id
}

export def extract [--from: string, --to: string = ""] {
  $in | range extract-root $from (if $to == "" { $from } else { $to })
}

export def fold [--from: string, --to: string, --summary: string, --label: string = "folded conversation segment"] {
  $in | range fold-root $from $to $summary $label
}

export def tree [--hidden] {
  $in | render tree $hidden
}

export def locate [text: string] {
  $in | walk locate-text $text true
}

export def locate-text [text: string, --hidden] {
  $in | walk locate-text $text $hidden
}

export def locate-bookmark [id: string, --hidden] {
  let state = $in
  let matches = (walk walk-state $state $hidden | where {|match|
    (walk bookmark-ids $match) | any {|bookmark| $bookmark == $id }
  })
  if (($matches | length) == 0) { error make { msg: $"Bookmark not found: ($id)" } }
  if (($matches | length) > 1) { error make { msg: $"Duplicate bookmark found: ($id)" } }
  $matches | first
}

export def display-last-message [] {
  let events = ($in | get root.children | where type == "event" and from == "model" and text != "")
  if ($events | is-empty) { "" } else { $events | last | get text }
}

export def add-tool-request [tool: string, input: record] {
  $in | common append-event {
    from: "model"
    to: ["harness"]
    kind: "tool_request"
    text: ""
    calls: [{ tool: $tool, input: $input }]
  }
}

export def add-trace [kind: string, data: any] {
  let state = $in
  let trace = { at: (date now | into string), kind: $kind, data: $data }
  if ("trace" in ($state | columns)) { $state | update trace { append $trace } } else { $state | insert trace [$trace] }
}

export def bookmarks [--hidden] {
  $in | bookmark list $hidden
}

export def extract-range [from: string, to: string] {
  $in | extract --from $from --to $to
}

export def with-extract [from: string, to: string, block: closure] {
  let state = $in
  let start = (walk locate-bookmark-root $state $from)
  let end = (walk locate-bookmark-root $state $to)
  let first = ([$start.index $end.index] | math min)
  let last = ([$start.index $end.index] | math max)
  let children = $state.root.children
  let before = if $first == 0 { [] } else { $children | slice 0..<$first }
  let after = if ($last + 1) >= ($children | length) { [] } else { $children | slice ($last + 1).. }
  let selected = ($children | slice $first..$last | where type == "event")
  $state | update root.children ($before | append (do $block $selected) | append $after)
}

export def update-actor [actor_id: string, block: closure] {
  let state = $in
  $state | update actors { upsert $actor_id (do $block ($state.actors | get $actor_id)) }
}
