export def node-search-text [node: record] {
  [($node.text? | default "") ($node.summary? | default "") ($node.label? | default "")]
  | where {|item| $item != "" }
  | str join "\n"
}

export def bookmark-id [bookmark: any] {
  if (($bookmark | describe) == "string") { $bookmark } else { $bookmark.id? | default null }
}

export def bookmark-ids [node: record] {
  $node.bookmarks? | default [] | each {|bookmark| bookmark-id $bookmark } | where {|id| $id != null }
}

export def describe-node [node: record] {
  {
    type: ($node.type? | default null)
    kind: ($node.kind? | default null)
    from: ($node.from? | default null)
    to: ($node.to? | default null)
    label: ($node.label? | default null)
    status: ($node.status? | default null)
    excerpt: ((node-search-text $node) | str substring 0..160)
  }
}

export def walk-node [node: record, path: string, hidden: bool, include_hidden: bool] {
  let current = [($node | merge { _path: $path, _hidden: $hidden })]
  if (($node.type? | default "") != "scope") { return $current }
  let children = (
    $node.children? | default [] | enumerate | reduce --fold [] {|entry, acc|
      $acc | append (walk-node $entry.item $"($path).children[($entry.index)]" $hidden $include_hidden)
    }
  )
  let hidden_children = if $include_hidden {
    $node.hidden?.children? | default [] | enumerate | reduce --fold [] {|entry, acc|
      $acc | append (walk-node $entry.item $"($path).hidden.children[($entry.index)]" true $include_hidden)
    }
  } else { [] }
  $current | append $children | append $hidden_children
}

export def walk-state [state: record, include_hidden: bool] {
  $state.root.children | enumerate | reduce --fold [] {|entry, acc|
    $acc | append (walk-node $entry.item $"root.children[($entry.index)]" false $include_hidden)
  }
}

export def locate-text [text: string, include_hidden: bool] {
  let state = $in
  let matches = (walk-state $state $include_hidden | where {|match| (node-search-text $match) | str contains $text })
  if (($matches | length) == 0) { error make { msg: $"No unique text match found: ($text)" } }
  if (($matches | length) > 1) { error make { msg: $"Ambiguous text match \((($matches | length)) matches\): ($text)" } }
  $matches | first
}

export def locate-bookmark-root [state: record, id: string] {
  let matches = ($state.root.children | enumerate | where {|entry|
    (bookmark-ids $entry.item) | any {|bookmark| $bookmark == $id }
  })
  if (($matches | length) == 0) { error make { msg: $"Bookmark not found: ($id)" } }
  if (($matches | length) > 1) { error make { msg: $"Duplicate bookmark found: ($id)" } }
  $matches | first
}

export def participants [node: record] {
  [($node.from? | default null) ...($node.to? | default []) ...($node.participants? | default [])]
  | where {|item| $item != null }
  | uniq
}
