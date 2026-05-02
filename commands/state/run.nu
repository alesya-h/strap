use lib/bookmark.nu
use lib/common.nu
use lib/init.nu
use lib/range.nu
use lib/render.nu
use lib/walk.nu

def init [] { init state }

def append-event [from: string, to: list<string>, kind: string, text: string = ""] {
  $in | common append-event { from: $from, to: $to, kind: $kind, text: $text }
}

def add-user [text: string] {
  $in | common append-event { from: "user", to: ["assistant"], kind: "message", text: $text }
}

def add-assistant [text: string] {
  $in | common append-event { from: "assistant", to: ["user"], kind: "message", text: $text }
}

def push [label: string] {
  $in | update root.children { append { type: "scope", label: $label, status: "open", participants: ["assistant", "harness"], children: [] } }
}

def pop [summary: string] {
  let state = $in
  let indexed = ($state.root.children | enumerate)
  let open = ($indexed | where {|entry| $entry.item.type == "scope" and $entry.item.status == "open" } | last)
  if ($open | is-empty) { error make { msg: "No open scope found" } }
  let collapsed = ($open.item | merge { status: "collapsed", summary: $summary, hidden: { children: $open.item.children }, children: [] })
  $state | update root.children { update $open.index $collapsed }
}

def bookmark-list [--hidden] { $in | bookmark list $hidden }

def bookmark-add [--text: string, --label: string = "", --id: string = "", --created-by: string = "assistant"] {
  let state = $in
  let bookmark_id = if $id == "" { $"bm_((date now | format date '%s'))_((random uuid) | str substring 0..3)" } else { $id }
  let bookmark_value = ({ id: $bookmark_id, created_by: $created_by, created_at: (date now | into string) } | if $label == "" { $in } else { $in | insert label $label })
  $state | bookmark add-root $text $bookmark_value
}

def bookmark-remove [id: string] { $in | bookmark remove-root $id }
def extract [--from: string, --to: string = ""] { $in | range extract-root $from (if $to == "" { $from } else { $to }) }
def fold [--from: string, --to: string, --summary: string, --label: string = "folded conversation segment"] { $in | range fold-root $from $to $summary $label }
def tree [--hidden] { $in | render tree $hidden }
def locate [text: string] { $in | walk locate-text $text true }
def locate-text [text: string, --hidden] { $in | walk locate-text $text $hidden }

def locate-bookmark [id: string, --hidden] {
  let state = $in
  let matches = (walk walk-state $state $hidden | where {|match| (walk bookmark-ids $match) | any {|bookmark| $bookmark == $id } })
  if (($matches | length) == 0) { error make { msg: $"Bookmark not found: ($id)" } }
  if (($matches | length) > 1) { error make { msg: $"Duplicate bookmark found: ($id)" } }
  $matches | first
}

def display-last-message [] {
  let events = ($in | get root.children | where type == "event" and from == "assistant" and text != "")
  if ($events | is-empty) { "" } else { $events | last | get text }
}

def add-tool-request [tool: string, input: record] {
  $in | common append-event { from: "assistant", to: ["harness"], kind: "tool_request", text: "", calls: [{ tool: $tool, input: $input }] }
}

def open-scope [label: string] { $in | push $label }
def collapse-last-scope [summary: string] { $in | pop $summary }
def last-assistant-text [] { $in | display-last-message }

def add-trace [kind: string, data: any] {
  let state = $in
  let trace = { at: (date now | into string), kind: $kind, data: $data }
  if ("trace" in ($state | columns)) { $state | update trace { append $trace } } else { $state | insert trace [$trace] }
}

def walk [--hidden] {
  let state = $in
  walk walk-state $state $hidden
}

def events [] { $in.root.children | where type == "event" }
def replace-events [new_events: list<any>] {
  let state = $in
  let children = $state.root.children
  let indexed = ($children | enumerate | where item.type == "event")
  if ($indexed | is-empty) { return ($state | update root.children { append $new_events }) }
  let first = ($indexed | first | get index)
  let before = if $first == 0 { [] } else { $children | slice 0..<$first | where type != "event" }
  let after = ($children | slice $first.. | where type != "event")
  $state | update root.children ($before | append $new_events | append $after)
}
def with-events [block: closure] { let state = $in; $state | replace-events (do $block ($state | events)) }
def map-events [block: closure] { let state = $in; $state | replace-events ($state | events | each {|event| do $block $event }) }
def where-events [block: closure] { let state = $in; $state | with-events {|items| $items | where {|event| do $block $event } } }
def bookmarks [--hidden] { $in | bookmark list $hidden }
def extract-range [from: string, to: string] { $in | extract --from $from --to $to }
def with-extract [from: string, to: string, block: closure] {
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
def strap-bin [] { $env.STRAP_BIN? | default ($env.STRAP_ROOT | path join bin strap) }
def present [item: any] { not ((($item | describe) =~ '^string') and ($item == "")) }
def transform-parts [sub: any, args: list<any>] { [($sub | default "")] | append $args | where {|item| present $item } }
def external-transform [input: any, parts: list<any>] {
  if ($parts | is-empty) { error make { msg: "Expected a closure, '-- <command> [args...]', or '<strap-command> [args...]'" } }
  let first = ($parts | first)
  if (($first | describe) =~ "closure") {
    if (($parts | length) != 1) { error make { msg: "Closure transforms must be the only transform argument" } }
    return (do $first $input)
  }
  let words = ($parts | each {|part| $part | into string })
  let command = if (($words | first) == "--") { $words | skip 1 } else { [(strap-bin)] | append $words }
  if ($command | is-empty) { error make { msg: "Expected command after --" } }
  $input | to json | run-external ($command | first) ...($command | skip 1) | from json
}
def transform-list [items: list<any>, parts: list<any>] { external-transform $items $parts }
def transform-one [item: any, parts: list<any>] { external-transform $item $parts }
def update-actor [actor_id: string, block: closure] {
  let state = $in
  $state | update actors { upsert $actor_id (do $block ($state.actors | get $actor_id)) }
}

def route [command: string, sub?: string, ...args: any, --from: string = "", --to: string = "", --summary: string = "", --label: string = "folded conversation segment", --text: string = "", --created-by: string = "assistant", --id: string = "", --hidden, --bookmark: string = ""] {
  match $command {
    "init" => { init }
    "append-event" => { $in | append-event ($sub | default "") ($args | get 0) ($args | get 1) ($args | get 2 | default "") }
    "add-user" => { $in | add-user ([($sub | default "")] | append $args | where {|item| $item != "" } | str join " ") }
    "add-assistant" => { $in | add-assistant ([($sub | default "")] | append $args | where {|item| $item != "" } | str join " ") }
    "add-tool-request" => { $in | add-tool-request ($sub | default "") ($args | first | default {}) }
    "push" => { $in | push ([($sub | default "scope")] | append $args | where {|item| $item != "" } | str join " ") }
    "pop" => { $in | pop ([($sub | default "")] | append $args | where {|item| $item != "" } | str join " ") }
    "open-scope" => { $in | open-scope ($sub | default "scope") }
    "collapse-last-scope" => { $in | collapse-last-scope ([($sub | default "")] | append $args | str join " ") }
    "last-assistant-text" => { $in | last-assistant-text }
    "add-trace" => { $in | add-trace ($sub | default "") ($args | first | default null) }
    "bookmark" => { dispatch-bookmark ($sub | default "") $args $text $label $id $created_by $hidden }
    "bookmark-list" => { $in | bookmark-list --hidden=$hidden }
    "bookmark-add" => { $in | bookmark-add --text $text --label $label --id $id --created-by $created_by }
    "bookmark-remove" => { $in | bookmark-remove ($sub | default "") }
    "extract" => { $in | extract --from $from --to $to }
    "extract-range" => { $in | extract-range ($sub | default "") ($args | first | default "") }
    "fold" => { $in | fold --from $from --to $to --summary (if $summary == "" { [($sub | default "")] | append $args | str join " " } else { $summary }) --label $label }
    "locate" => { $in | locate (if $text == "" { [($sub | default "")] | append $args | str join " " } else { $text }) }
    "locate-text" => { $in | locate-text ($sub | default "") --hidden=$hidden }
    "locate-bookmark" => { $in | locate-bookmark ($sub | default "") --hidden=$hidden }
    "show" => { dispatch-show ($sub | default "") $text $bookmark }
    "tree" => { $in | tree --hidden=$hidden }
    "display-last-message" => { $in | display-last-message }
    "walk" => { $in | walk --hidden=$hidden }
    "events" => { $in | events }
    "with-events" => { $in | with-events {|items| transform-list $items (transform-parts $sub $args) } }
    "map-events" => { $in | map-events {|event| transform-one $event (transform-parts $sub $args) } }
    "where-events" => { $in | where-events {|event| transform-one $event (transform-parts $sub $args) } }
    "bookmarks" => { $in | bookmarks --hidden=$hidden }
    "with-extract" => {
      let start = if $from == "" { $sub | default "" } else { $from }
      let end = if $to == "" { $args | get 0 } else { $to }
      let transform = if $from == "" { transform-parts ($args | get 1) ($args | skip 2) } else { transform-parts $sub $args }
      $in | with-extract $start $end {|items| transform-list $items $transform }
    }
    "update-actor" => { $in | update-actor ($sub | default "") ($args | first) }
    _ => { error make { msg: $"Unknown state command: ($command)" } }
  }
}

export def main [command?: string, sub?: string, ...args: any, --from: string = "", --to: string = "", --summary: string = "", --label: string = "folded conversation segment", --text: string = "", --created-by: string = "assistant", --id: string = "", --hidden, --bookmark: string = ""] {
  if ($command | is-empty) { error make { msg: "Usage: strap state <command> [args]" } }
  $in | route $command ($sub | default "") ...$args --from $from --to $to --summary $summary --label $label --text $text --created-by $created_by --id $id --hidden=$hidden --bookmark $bookmark
}

def dispatch-bookmark [sub: string, args: list<string>, text: string, label: string, id: string, created_by: string, hidden: bool] {
  match $sub {
    "add" => { $in | bookmark-add --text (if $text == "" { $args | str join " " } else { $text }) --label $label --id $id --created-by $created_by }
    "list" => { $in | bookmark-list --hidden=$hidden }
    "remove" => { $in | bookmark-remove ($args | first | default "") }
    _ => { error make { msg: "Usage: strap state bookmark <add|list|remove>" } }
  }
}

def dispatch-show [selector: string, text: string, bookmark_id: string] {
  let state = $in
  if $text != "" { return ($state | locate $text) }
  let id_value = if $bookmark_id == "" { $selector } else { $bookmark_id }
  let matches = (walk walk-state $state true | where {|match| (walk bookmark-ids $match) | any {|id| $id == $id_value } })
  if (($matches | length) != 1) { error make { msg: $"Bookmark not found or duplicate: ($id_value)" } }
  $matches | first
}
