export def actor-frame [state: record] {
  let actor = ($state.actors.assistant? | default {})
  mut sections = []

  if (($actor.self.public? | default "") != "") {
    $sections = ($sections | append $"<self_public>\n($actor.self.public)\n</self_public>")
  }
  if (($actor.self.private? | default "") != "") {
    $sections = ($sections | append $"<self_private>\n($actor.self.private)\n</self_private>")
  }
  for peer in (($actor.peers? | default {}) | transpose name rel) {
    if (($peer.rel.contract? | default "") != "") {
      $sections = ($sections | append $"<contract peer=\"($peer.name)\">\n($peer.rel.contract)\n</contract>")
    }
  }
  $sections | str join "\n\n"
}

export def flatten [node: record] {
  if $node.type == "event" { return [$node] }
  if $node.type == "scope" {
    if (($node.status? | default "open") == "collapsed") {
      return [{ type: "event", from: "harness", to: ($node.participants? | default []), kind: "summary", text: ($node.summary? | default $"[collapsed scope: ($node.label)]") }]
    }
    mut items = []
    for child in ($node.children? | default []) { $items = ($items | append (flatten $child)) }
    return $items
  }
  []
}

export def event-text [event: record] {
  let to = if (($event.to? | default []) | describe | str starts-with "list") { $event.to | str join "," } else { $event.to? | default "all" }
  [$"[($event.from) -> ($to); ($event.kind? | default 'message')]" ($event.text? | default "")] | str join "\n" | str trim
}
