use walk.nu

export def list [include_hidden: bool] {
  let state = $in
  walk walk-state $state $include_hidden | reduce --fold [] {|match, acc|
    $acc | append (
      $match.bookmarks? | default [] | each {|bookmark|
        let id = (walk bookmark-id $bookmark)
        let base = if (($bookmark | describe) == "string") { { id: $id } } else { $bookmark }
        $base | merge { path: $match._path, hidden: $match._hidden, node: (walk describe-node $match) }
      }
    )
  }
}

export def add-root [text: string, bookmark: record] {
  let state = $in
  let matches = ($state.root.children | enumerate | where {|entry| (walk node-search-text $entry.item) | str contains $text })
  if (($matches | length) == 0) { error make { msg: $"No unique text match found: ($text)" } }
  if (($matches | length) > 1) { error make { msg: $"Ambiguous text match \((($matches | length)) matches\): ($text)" } }
  let match = ($matches | first)
  let node = ($match.item | upsert bookmarks (($match.item.bookmarks? | default []) | append $bookmark))
  print -e $"bookmark ($bookmark.id) added at root.children[($match.index)]"
  $state | update root.children { update $match.index $node }
}

export def remove-root [id: string] {
  let state = $in
  mut removed = 0
  mut children = []
  for node in $state.root.children {
    let before = ($node.bookmarks? | default [])
    let after = ($before | where {|bookmark| (walk bookmark-id $bookmark) != $id })
    if (($before | length) != ($after | length)) { $removed = $removed + (($before | length) - ($after | length)) }
    let next = if ($after | is-empty) { $node | reject --optional bookmarks } else { $node | upsert bookmarks $after }
    $children = ($children | append $next)
  }
  if $removed == 0 { error make { msg: $"Bookmark not found: ($id)" } }
  $state | update root.children $children
}
