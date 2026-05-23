use walk.nu

export def tree [include_hidden: bool] {
  let state = $in
  let rendered = (walk walk-state $state $include_hidden | each {|node|
    let text = ((walk node-search-text $node) | str substring 0..80)
    let marks = (walk bookmark-ids $node | each {|id| $" @($id)" } | str join "")
    let prefix = if $node._hidden { "  - hidden" } else { "  -" }
    $"($prefix) ($node.from? | default '?')($marks): ($text)"
  })
  (["history"] | append $rendered) | str join "\n"
}
