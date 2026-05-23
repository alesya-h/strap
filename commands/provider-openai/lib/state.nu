export def history [state: record] { $state.history? | default [] }

export def active-agent-id [state: record] {
  $state | get --optional runtime.active_model | default ""
}

export def actor [state: record, id: string] { $state.actors | get --optional $id | default {} }

export def actor-frame [state: record] {
  let id = (active-agent-id $state)
  let actor = (actor $state $id)
  mut sections = []
  if (($actor | get --optional self.public | default "") != "") { $sections = ($sections | append $"<self_public>\n($actor.self.public)\n</self_public>") }
  if (($actor | get --optional self.private | default "") != "") { $sections = ($sections | append $"<self_private>\n($actor.self.private)\n</self_private>") }
  for peer in (($actor | get --optional peers | default {}) | transpose name rel) {
    let contract = if (($peer.rel | describe) == "string") { $peer.rel } else { $peer.rel.contract? | default "" }
    if $contract != "" { $sections = ($sections | append $"<contract peer=\"($peer.name)\">\n($contract)\n</contract>") }
  }
  $sections | str join "\n\n"
}

export def event-text [event: record] {
  [$"[($event.from); ($event.kind? | default 'message')]" ($event.text? | default "")] | str join "\n" | str trim
}

export def provider-role [state: record, event: record] {
  let kind = ((actor $state $event.from).kind? | default "")
  if ($kind == "model") or ($event.from == (active-agent-id $state)) or ($event.from == "model") { "assistant" } else { "user" }
}

export def chat-messages [state: record] {
  [{ role: "system", content: (actor-frame $state) }]
  | append ((history $state) | each {|event| { role: (provider-role $state $event), content: (event-text $event) } })
}
