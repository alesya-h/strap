use walk.nu

def render-node [node: record, indent: string, include_hidden: bool] {
  let marks = (walk bookmark-ids $node | each {|id| $" @($id)" } | str join "")
  let text = ((walk node-search-text $node) | str substring 0..80)
  let line = if (($node.type? | default "") == "event") {
    $"($indent)- event ($node.from? | default '?') -> (($node.to? | default ['all']) | str join ','); ($node.kind? | default 'message')($marks): ($text)"
  } else {
    $"($indent)- scope ($node.label? | default 'scope') [($node.status? | default 'open')]($marks): (($node.summary? | default '') | str substring 0..80)"
  }
  let children = if (($node.type? | default "") == "scope") and (($node.status? | default "open") != "collapsed") {
    $node.children? | default [] | reduce --fold [] {|child, acc| $acc | append (render-node $child $"($indent)  " $include_hidden) }
  } else { [] }
  let hidden = if $include_hidden and (($node.hidden?.children? | default [] | length) > 0) {
    [$"($indent)  hidden:"] | append ($node.hidden.children | reduce --fold [] {|child, acc| $acc | append (render-node $child $"($indent)    " $include_hidden) })
  } else { [] }
  [$line] | append $children | append $hidden
}

export def tree [include_hidden: bool] {
  let state = $in
  (["root"] | append ($state.root.children | reduce --fold [] {|node, acc| $acc | append (render-node $node "  " $include_hidden) })) | str join "\n"
}
