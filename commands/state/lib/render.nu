use walk.nu

def render-node [node: record, indent: string, include_hidden: bool] {
  let marks = (walk bookmark-ids $node | each {|id| $" @($id)" } | str join "")
  let text = ((walk node-search-text $node) | str substring 0..80)
  let line = if (($node.type? | default "") == "event") {
    let to = (($node.to? | default ['all']) | str join ',')
    $"($indent)- event ($node.from? | default '?') -> ($to); ($node.kind? | default 'message')($marks): ($text)"
  } else {
    let summary = (($node.summary? | default '') | str substring 0..80)
    $"($indent)- scope ($node.label? | default 'scope') [($node.status? | default 'open')]($marks): ($summary)"
  }
  let children = if (($node.type? | default "") == "scope") and (($node.status? | default "open") != "collapsed") {
    $node.children? | default [] | reduce --fold [] {|child, acc|
      $acc | append (render-node $child $"($indent)  " $include_hidden)
    }
  } else { [] }
  let hidden = if $include_hidden and (($node.hidden?.children? | default [] | length) > 0) {
    [$"($indent)  hidden:"] | append (
      $node.hidden.children | reduce --fold [] {|child, acc|
        $acc | append (render-node $child $"($indent)    " $include_hidden)
      }
    )
  } else { [] }
  [$line] | append $children | append $hidden
}

export def tree [include_hidden: bool] {
  let state = $in
  let rendered = ($state.root.children | reduce --fold [] {|node, acc|
    $acc | append (render-node $node "  " $include_hidden)
  })
  (["root"] | append $rendered) | str join "\n"
}
