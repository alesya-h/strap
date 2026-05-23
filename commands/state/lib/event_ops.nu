export def events [] { $in.history }

export def with-events [block: closure] {
  let state = $in
  $state | update history (do $block $state.history)
}

export def map-events [block: closure] {
  let state = $in
  $state | update history ($state.history | each {|event| do $block $event })
}

export def where-events [block: closure] {
  let state = $in
  $state | update history ($state.history | where {|event| do $block $event })
}
