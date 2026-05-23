use bookmark.nu
use common.nu
use init.nu [state]
use range.nu
use render.nu
use walk.nu

export def init [] { state }

export def append-event [from: string, _to: list<string>, _kind: string, text: string = ""] {
  $in | common append-message { from: $from, text: $text }
}

export def add-user [text: string] { $in | common append-message { from: "user", text: $text } }

export def add-model [text: string] {
  let state = $in
  let actor = ($state | get --optional runtime.active_model | default "model")
  $state | common append-message { from: $actor, text: $text }
}

def ensure-strap [] { $in | upsert actors.strap { kind: "runtime", self: { public: "Local Strap harness." } } }

export def push [label: string] {
  $in | ensure-strap | common append-message { from: "strap", kind: "note", text: $"opened context: ($label)" }
}

export def pop [summary: string] {
  $in | ensure-strap | common append-message { from: "strap", kind: "note", text: $summary }
}

export def bookmark-list [--hidden] { $in | bookmark list $hidden }

export def bookmark-add [--text: string, --label: string = "", --id: string = "", --created-by: string = "model"] {
  let bookmark_id = if $id == "" { $"bm_((date now | format date '%s'))_((random uuid) | str substring 0..3)" } else { $id }
  let base = { id: $bookmark_id, created_by: $created_by, created_at: (date now | into string) }
  let value = if $label == "" { $base } else { $base | insert label $label }
  $in | bookmark add-root $text $value
}

export def bookmark-remove [id: string] { $in | bookmark remove-root $id }
export def extract [--from: string, --to: string = ""] { $in | range extract-root $from (if $to == "" { $from } else { $to }) }
export def fold [--from: string, --to: string, --summary: string, --label: string = "folded conversation segment"] { $in | range fold-root $from $to $summary $label }
export def tree [--hidden] { $in | render tree $hidden }
export def locate [text: string] { $in | walk locate-text $text true }
export def locate-text [text: string, --hidden] { $in | walk locate-text $text $hidden }
export def locate-bookmark [id: string, --hidden] { $in | walk locate-bookmark $id $hidden }

export def display-last-message [] {
  let state = $in
  let active = ($state | get --optional runtime.active_model | default "model")
  let events = ($state.history | where {|item| (($item.text? | default "") != "") and (($item.from? | default "") == $active or (($state.actors | get --optional ($item.from? | default "") | get kind? | default "") == "model")) })
  if ($events | is-empty) { "" } else { $events | last | get text }
}

export def add-tool-request [tool: string, input: record] {
  let state = $in
  let actor = ($state | get --optional runtime.active_model | default "model")
  $state | common append-message { from: $actor, text: "", calls: [{ tool: $tool, input: $input }] }
}

export def add-trace [kind: string, data: any] {
  let state = $in
  let trace = { at: (date now | into string), kind: $kind, data: $data }
  if ("trace" in ($state | columns)) { $state | update trace { append $trace } } else { $state | insert trace [$trace] }
}

export def bookmarks [--hidden] { $in | bookmark list $hidden }
export def extract-range [from: string, to: string] { $in | extract --from $from --to $to }

export def with-extract [from: string, to: string, block: closure] {
  let state = $in
  let start = (walk locate-bookmark-root $state $from)
  let end = (walk locate-bookmark-root $state $to)
  let first = ([$start.index $end.index] | math min)
  let last = ([$start.index $end.index] | math max)
  let before = if $first == 0 { [] } else { $state.history | slice 0..<$first }
  let after = if ($last + 1) >= ($state.history | length) { [] } else { $state.history | slice ($last + 1).. }
  let selected = ($state.history | slice $first..$last)
  $state | update history ($before | append (do $block $selected) | append $after)
}

export def update-actor [actor_id: string, block: closure] {
  let state = $in
  $state | update actors { upsert $actor_id (do $block ($state.actors | get --optional $actor_id | default {})) }
}
