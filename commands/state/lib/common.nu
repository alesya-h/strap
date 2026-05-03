export def append-event [event: record] {
  let state = $in
  $state | update root.children { append ({ type: "event" } | merge $event) }
}
