use walk.nu

export def extract-root [from: string, to: string] {
  let state = $in
  let start = (walk locate-bookmark-root $state $from)
  let end = (walk locate-bookmark-root $state $to)
  let first = ([$start.index $end.index] | math min)
  let last = ([$start.index $end.index] | math max)
  let messages = ($state.history | slice $first..$last)
  { version: "strap.context.v0.1", source: { state_version: $state.version, from: $from, to: $to, path_from: $"history[($start.index)]", path_to: $"history[($end.index)]" }, messages: $messages, events: $messages }
}

export def fold-root [from: string, to: string, summary: string, label: string] {
  let state = $in
  let start = (walk locate-bookmark-root $state $from)
  let end = (walk locate-bookmark-root $state $to)
  let first = ([$start.index $end.index] | math min)
  let last = ([$start.index $end.index] | math max)
  let messages = ($state.history | slice $first..$last)
  let before = if $first == 0 { [] } else { $state.history | slice 0..<($first) }
  let after = if ($last + 1) >= ($state.history | length) { [] } else { $state.history | slice ($last + 1).. }
  let item = { from: "strap", kind: "tool_result", text: "", calls: [{ id: $"compact_((random uuid) | str substring 0..7)", tool: "history.summarize", input: { start: $first, end: $last, label: $label }, ok: true, output: { summary: $summary }, hidden: { messages: $messages } }] }
  $state | upsert actors.strap { kind: "runtime", self: { public: "Local Strap harness." } } | update history ($before | append $item | append $after)
}
