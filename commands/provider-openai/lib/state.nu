export def flatten [node: record] {
  def walk [n: record] {
    if $n.type == "event" { return [$n] }
    if $n.type == "scope" {
      if ($n.status? | default "open") == "collapsed" {
        return [{ type: "event", from: "harness", kind: "summary", text: ($n.summary? | default $"[collapsed scope: ($n.label)]") }]
      }
      mut items = []
      for child in ($n.children? | default []) { $items = ($items | append (walk $child)) }
      return $items
    }
    []
  }
  walk $node
}

def active-agent [state: record] {
  let agents = ($state.actors.agents? | default {})
  let active = ($state | get --optional runtime.active_agent | default "")
  if $active != "" { return ($agents | get --optional $active | default {}) }
  let rows = ($agents | transpose name actor)
  if ($rows | is-empty) { {} } else { $rows.0.actor }
}

export def actor-frame [state: record] {
  let actor = (active-agent $state)
  mut sections = []
  if ((($actor | get --optional self.public | default "")) != "") { $sections = ($sections | append $"<self_public>\n(($actor | get --optional self.public | default ""))\n</self_public>") }
  if ((($actor | get --optional self.private | default "")) != "") { $sections = ($sections | append $"<self_private>\n(($actor | get --optional self.private | default ""))\n</self_private>") }
  for peer in (($actor | get --optional peers | default {}) | transpose name rel) {
    let contract = if (($peer.rel | describe) == "string") { $peer.rel } else { $peer.rel.contract? | default "" }
    if $contract != "" { $sections = ($sections | append $"<contract peer=\"($peer.name)\">\n($contract)\n</contract>") }
  }
  $sections | str join "\n\n"
}

export def event-text [event: record] {
  let who = if (($event.agent? | default "") == "") { $event.from } else { $"($event.from):($event.agent)" }
  [$"[($who); ($event.kind? | default 'message')]" ($event.text? | default "")] | str join "\n" | str trim
}

export def chat-messages [state: record] {
  [{ role: "system", content: (actor-frame $state) }]
  | append ((flatten $state.root) | each {|event| { role: (if $event.from == "model" { "assistant" } else { "user" }), content: (event-text $event) } })
}
