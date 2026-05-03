export def events [] {
  $in.root.children | where type == "event"
}

export def replace-events [new_events: list<any>] {
  let state = $in
  let children = $state.root.children
  let indexed = ($children | enumerate | where item.type == "event")
  if ($indexed | is-empty) { return ($state | update root.children { append $new_events }) }

  let first = ($indexed | first | get index)
  let before = if $first == 0 { [] } else { $children | slice 0..<$first | where type != "event" }
  let after = ($children | slice $first.. | where type != "event")
  $state | update root.children ($before | append $new_events | append $after)
}

export def with-events [block: closure] {
  let state = $in
  $state | replace-events (do $block ($state | events))
}

export def map-events [block: closure] {
  let state = $in
  $state | replace-events ($state | events | each {|event| do $block $event })
}

export def where-events [block: closure] {
  let state = $in
  $state | with-events {|items| $items | where {|event| do $block $event } }
}
