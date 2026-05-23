use walk.nu

export def add-root [text: string, bookmark: record] {
  let state = $in
  let matches = ($state.history | enumerate | where {|entry| (walk node-search-text $entry.item) | str contains $text })
  if (($matches | length) == 0) { error make { msg: $"No unique text match found: ($text)" } }
  if (($matches | length) > 1) { error make { msg: $"Ambiguous text match \((($matches | length)) matches\): ($text)" } }
  let match = ($matches | first)
  let node = ($match.item | upsert bookmarks { append $bookmark })
  print -e $"bookmark ($bookmark.id) added at history[($match.index)]"
  $state | update history { update $match.index $node }
}

export def remove-root [id: string] {
  let state = $in
  let children = ($state.history | each {|node| $node | update bookmarks (($node.bookmarks? | default []) | where {|bookmark| (walk bookmark-id $bookmark) != $id }) })
  $state | update history $children
}

export def list [include_hidden: bool] {
  let state = $in
  walk walk-state $state $include_hidden | each {|node|
    (walk bookmark-ids $node) | each {|id| { id: $id, path: $node._path, hidden: $node._hidden, node: (walk describe-node $node) } }
  } | flatten
}
