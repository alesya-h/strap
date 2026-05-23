export def history [state: record] { $state.history? | default [] }
export def active-agent-id [state: record] { $state | get --optional runtime.active_model | default "" }
export def actor [state: record, id: string] { $state.actors | get --optional $id | default {} }

export def actor-frame [state: record] {
  let actor = (actor $state (active-agent-id $state))
  mut sections = []
  if (($actor | get --optional self.public | default "") != "") { $sections = ($sections | append $"<self_public>\n($actor.self.public)\n</self_public>") }
  if (($actor | get --optional self.private | default "") != "") { $sections = ($sections | append $"<self_private>\n($actor.self.private)\n</self_private>") }
  for peer in (($actor | get --optional peers | default {}) | transpose name rel) {
    let contract = if (($peer.rel | describe) == "string") { $peer.rel } else { $peer.rel.contract? | default "" }
    if $contract != "" { $sections = ($sections | append $"<contract peer=\"($peer.name)\">\n($contract)\n</contract>") }
  }
  $sections | str join "\n\n"
}

export def provider-role [state: record, event: record] { if ((((actor $state $event.from).kind? | default "") == "model") or ($event.from == (active-agent-id $state)) or ($event.from == "model")) { "assistant" } else { "user" } }
export def event-text [event: record] { [$"[($event.from); ($event.kind? | default 'message')]" ($event.text? | default "")] | str join "\n" | str trim }
