export def read-state [file: string] {
  if $file == "-" { open --raw /dev/stdin | from json } else { open $file }
}

export def write-json [] {
  $in | to json --indent 2 | print
}

export def append-event [event: record] {
  let state = $in
  $state | update root.children { append ({ type: "event" } | merge $event) }
}
