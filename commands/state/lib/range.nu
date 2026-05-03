use walk.nu

export def extract-root [from: string, to: string] {
  let state = $in
  let start = (walk locate-bookmark-root $state $from)
  let end = (walk locate-bookmark-root $state $to)
  let first = ([$start.index $end.index] | math min)
  let last = ([$start.index $end.index] | math max)
  let children = ($state.root.children | slice $first..$last)
  {
    version: "strap.context.v0.1"
    source: {
      state_version: $state.version
      from: $from
      to: $to
      path_from: $"root.children[($start.index)]"
      path_to: $"root.children[($end.index)]"
    }
    nodes: $children
    events: $children
  }
}

export def fold-root [from: string, to: string, summary: string, label: string] {
  let state = $in
  let start = (walk locate-bookmark-root $state $from)
  let end = (walk locate-bookmark-root $state $to)
  let first = ([$start.index $end.index] | math min)
  let last = ([$start.index $end.index] | math max)
  let children = ($state.root.children | slice $first..$last)
  let before = if $first == 0 { [] } else { $state.root.children | slice 0..<($first) }
  let after = if ($last + 1) >= ($state.root.children | length) {
    []
  } else {
    $state.root.children | slice ($last + 1)..
  }
  let participants = ($children | reduce --fold [] {|node, acc| $acc | append (walk participants $node) } | uniq)
  let scope = {
    type: "scope"
    label: $label
    status: "collapsed"
    participants: $participants
    summary: $summary
    children: []
    hidden: { children: $children }
  }
  $state | update root.children ($before | append $scope | append $after)
}
