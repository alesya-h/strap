use ../../commands/state/run.nu

export def init [] { run init }

export def append-event [from: string, to: list<string>, kind: string, text: string = ""] {
  $in | run append-event $from $to $kind $text
}

export def add-user [text: string] { $in | run add-user $text }

export def add-assistant [text: string] { $in | run add-assistant $text }

export def add-tool-request [tool: string, input: record] {
  $in | run add-tool-request $tool $input
}

export def open-scope [label: string] { $in | run open-scope $label }

export def collapse-last-scope [summary: string] {
  $in | run collapse-last-scope $summary
}

export def last-assistant-text [] { $in | run last-assistant-text }

export def add-trace [kind: string, data: any] { $in | run add-trace $kind $data }

export def push [label: string] { $in | run push $label }

export def pop [summary: string] { $in | run pop $summary }

export def tree [--hidden] { $in | run tree --hidden=$hidden }

export def display-last-message [] { $in | run display-last-message }

export def bookmark-list [--hidden] { $in | run bookmark-list --hidden=$hidden }

export def bookmark-add [--text: string, --label: string = "", --id: string = ""] {
  $in | run bookmark-add --text $text --label $label --id $id
}

export def bookmark-remove [id: string] { $in | run bookmark-remove $id }

export def extract [--from: string, --to: string = ""] {
  $in | run extract --from $from --to $to
}

export def fold [--from: string, --to: string, --summary: string, --label: string = "folded conversation segment"] {
  $in | run fold --from $from --to $to --summary $summary --label $label
}

export def walk [--hidden] { $in | run walk --hidden=$hidden }

export def events [] { $in | run events }

export def with-events [block: closure] { $in | run with-events "" $block }

export def map-events [block: closure] { $in | run map-events "" $block }

export def where-events [block: closure] { $in | run where-events "" $block }

export def bookmarks [--hidden] { $in | run bookmarks --hidden=$hidden }

export def locate-text [text: string, --hidden] {
  $in | run locate-text $text --hidden=$hidden
}

export def locate-bookmark [id: string, --hidden] {
  $in | run locate-bookmark $id --hidden=$hidden
}

export def extract-range [from: string, to: string] {
  $in | run extract-range $from $to
}

export def with-extract [from: string, to: string, block: closure] {
  $in | run with-extract $from $to $block
}

export def update-actor [actor_id: string, block: closure] {
  $in | run update-actor $actor_id $block
}
