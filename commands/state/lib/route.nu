use actions.nu
use event_ops.nu
use transform.nu
use walk.nu

export def dispatch [
  command: string,
  sub?: string,
  ...args: any,
  --from: string = "",
  --to: string = "",
  --summary: string = "",
  --label: string = "folded conversation segment",
  --text: string = "",
  --created-by: string = "assistant",
  --id: string = "",
  --hidden,
  --bookmark: string = ""
] {
  match $command {
    "init" => { actions init }
    "append-event" => {
      $in | actions append-event ($sub | default "") ($args | get 0) ($args | get 1) ($args | get 2 | default "")
    }
    "add-user" => { $in | actions add-user (text-arg $sub $args) }
    "add-assistant" => { $in | actions add-assistant (text-arg $sub $args) }
    "add-tool-request" => { $in | actions add-tool-request ($sub | default "") ($args | first | default {}) }
    "push" => { $in | actions push ([($sub | default "scope")] | append $args | where {|item| $item != "" } | str join " ") }
    "pop" => { $in | actions pop (text-arg $sub $args) }
    "open-scope" => { $in | actions push ($sub | default "scope") }
    "collapse-last-scope" => { $in | actions pop ([($sub | default "")] | append $args | str join " ") }
    "last-assistant-text" => { $in | actions display-last-message }
    "add-trace" => { $in | actions add-trace ($sub | default "") ($args | first | default null) }
    "bookmark" => { dispatch-bookmark ($sub | default "") $args $text $label $id $created_by $hidden }
    "bookmark-list" => { $in | actions bookmark-list --hidden=$hidden }
    "bookmark-add" => { $in | actions bookmark-add --text $text --label $label --id $id --created-by $created_by }
    "bookmark-remove" => { $in | actions bookmark-remove ($sub | default "") }
    "extract" => { $in | actions extract --from $from --to $to }
    "extract-range" => { $in | actions extract-range ($sub | default "") ($args | first | default "") }
    "fold" => { $in | actions fold --from $from --to $to --summary (fold-summary $sub $args $summary) --label $label }
    "locate" => { $in | actions locate (if $text == "" { [($sub | default "")] | append $args | str join " " } else { $text }) }
    "locate-text" => { $in | actions locate-text ($sub | default "") --hidden=$hidden }
    "locate-bookmark" => { $in | actions locate-bookmark ($sub | default "") --hidden=$hidden }
    "show" => { dispatch-show ($sub | default "") $text $bookmark }
    "tree" => { $in | actions tree --hidden=$hidden }
    "display-last-message" => { $in | actions display-last-message }
    "walk" => {
      let state = $in
      walk walk-state $state $hidden
    }
    "events" => { $in | event_ops events }
    "with-events" => { $in | event_ops with-events {|items| transform list $items (transform parts $sub $args) } }
    "map-events" => { $in | event_ops map-events {|event| transform one $event (transform parts $sub $args) } }
    "where-events" => { $in | event_ops where-events {|event| transform one $event (transform parts $sub $args) } }
    "bookmarks" => { $in | actions bookmarks --hidden=$hidden }
    "with-extract" => { dispatch-with-extract $sub $args $from $to }
    "update-actor" => { $in | actions update-actor ($sub | default "") ($args | first) }
    _ => { error make { msg: $"Unknown state command: ($command)" } }
  }
}

def fold-summary [sub: any, args: list<any>, summary: string] {
  if $summary == "" { [($sub | default "")] | append $args | str join " " } else { $summary }
}

def text-arg [sub: any, args: list<any>] {
  [($sub | default "")] | append $args | where {|item| $item != "" } | str join " "
}

def dispatch-bookmark [sub: string, args: list<string>, text: string, label: string, id: string, created_by: string, hidden: bool] {
  match $sub {
    "add" => { $in | actions bookmark-add --text (if $text == "" { $args | str join " " } else { $text }) --label $label --id $id --created-by $created_by }
    "list" => { $in | actions bookmark-list --hidden=$hidden }
    "remove" => { $in | actions bookmark-remove ($args | first | default "") }
    _ => { error make { msg: "Usage: strap state bookmark <add|list|remove>" } }
  }
}

def dispatch-show [selector: string, text: string, bookmark_id: string] {
  let state = $in
  if $text != "" { return ($state | actions locate $text) }

  let id_value = if $bookmark_id == "" { $selector } else { $bookmark_id }
  let matches = (walk walk-state $state true | where {|match|
    (walk bookmark-ids $match) | any {|id| $id == $id_value }
  })
  if (($matches | length) != 1) { error make { msg: $"Bookmark not found or duplicate: ($id_value)" } }
  $matches | first
}

def dispatch-with-extract [sub: any, args: list<any>, from: string, to: string] {
  let start = if $from == "" { $sub | default "" } else { $from }
  let end = if $to == "" { $args | get 0 } else { $to }
  let transform_args = if $from == "" {
    transform parts ($args | get 1) ($args | skip 2)
  } else {
    transform parts $sub $args
  }
  $in | actions with-extract $start $end {|items| transform list $items $transform_args }
}
