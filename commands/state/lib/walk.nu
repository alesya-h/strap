export def node-search-text [node: record] {
  [($node.text? | default "") ($node.output?.summary? | default "")]
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
  { from: ($node.from? | default null), kind: ($node.kind? | default null), excerpt: ((node-search-text $node) | str substring 0..160) }
}

export def walk-state [state: record, include_hidden: bool] {
  mut out = ($state.history | enumerate | each {|entry| $entry.item | merge { _path: $"history[($entry.index)]", _hidden: false, index: $entry.index } })
  if $include_hidden {
    for entry in ($state.history | enumerate) {
      for call in ($entry.item.calls? | default [] | enumerate) {
        for msg in ($call.item.hidden?.messages? | default [] | enumerate) {
          $out = ($out | append ($msg.item | merge { _path: $"history[($entry.index)].calls[($call.index)].hidden.messages[($msg.index)]", _hidden: true }))
        }
      }
    }
  }
  $out
}

export def locate-text [text: string, include_hidden: bool] {
  let state = $in
  let matches = (walk-state $state $include_hidden | where {|match| (node-search-text $match) | str contains $text })
  if (($matches | length) == 0) { error make { msg: $"No unique text match found: ($text)" } }
  if (($matches | length) > 1) { error make { msg: $"Ambiguous text match \((($matches | length)) matches\): ($text)" } }
  $matches | first
}

export def locate-bookmark-root [state: record, id: string] {
  let matches = ($state.history | enumerate | where {|entry| (bookmark-ids $entry.item) | any {|bookmark| $bookmark == $id } })
  if (($matches | length) == 0) { error make { msg: $"Bookmark not found: ($id)" } }
  if (($matches | length) > 1) { error make { msg: $"Duplicate bookmark found: ($id)" } }
  $matches | first
}

export def locate-bookmark [id: string, include_hidden: bool] {
  let state = $in
  let matches = (walk-state $state $include_hidden | where {|match| (bookmark-ids $match) | any {|bookmark| $bookmark == $id } })
  if (($matches | length) == 0) { error make { msg: $"Bookmark not found: ($id)" } }
  if (($matches | length) > 1) { error make { msg: $"Duplicate bookmark found: ($id)" } }
  $matches | first
}

export def participants [node: record] { [($node.from? | default null)] | where {|item| $item != null } | uniq }
