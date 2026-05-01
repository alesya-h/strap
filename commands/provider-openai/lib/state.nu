export def flatten [node: record] {
  def walk [n: record] {
    if $n.type == "event" {
      return [$n]
    }

    if $n.type == "scope" {
      if ($n.status? | default "open") == "collapsed" {
        return [{
          type: "event"
          from: "harness"
          to: ($n.participants? | default [])
          kind: "summary"
          text: ($n.summary? | default $"[collapsed scope: ($n.label)]")
        }]
      }

      mut items = []
      for child in ($n.children? | default []) {
        $items = ($items | append (walk $child))
      }
      return $items
    }

    []
  }

  walk $node
}

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

export def event-text [event: record] {
  let to = if (($event.to? | default []) | describe | str starts-with "list") {
    $event.to | str join ","
  } else {
    $event.to? | default "all"
  }

  [$"[($event.from) -> ($to); ($event.kind? | default 'message')]" ($event.text? | default "")]
  | str join "\n"
  | str trim
}

export def chat-messages [state: record] {
  [{ role: "system", content: (actor-frame $state) }]
  | append ((flatten $state.root) | each {|event|
      {
        role: (if $event.from == "assistant" { "assistant" } else { "user" })
        content: (event-text $event)
      }
    })
}
