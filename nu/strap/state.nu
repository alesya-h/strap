use ./common.nu *

export def init [] { call-json [state init] }
export def add-user [text: string] { $in | filter-json [state add-user $text] }
export def add-assistant [text: string] { $in | filter-json [state add-assistant $text] }
export def push [label: string] { $in | filter-json [state push $label] }
export def pop [summary: string] { $in | filter-json [state pop $summary] }
export def tree [--hidden] { $in | filter-text ([state tree] ++ (maybe-switch "--hidden" $hidden)) }
export def display-last-message [] { $in | filter-text [state display-last-message] }
export def bookmark-list [--hidden] { $in | filter-json ([state bookmark list] ++ (maybe-switch "--hidden" $hidden)) }
export def bookmark-add [--text: string, --label: string = "", --id: string = ""] {
  $in | filter-json ([state bookmark add] ++ (maybe-flag "--text" $text) ++ (maybe-flag "--label" $label) ++ (maybe-flag "--id" $id))
}
export def bookmark-remove [id: string] { $in | filter-json [state bookmark remove $id] }

export def extract [--from: string, --to: string = ""] {
  let end = (if $to == "" { $from } else { $to })
  $in | filter-json [state extract "--from" $from "--to" $end]
}

export def fold [--from: string, --to: string, --summary: string, --label: string = "folded conversation segment"] {
  $in | filter-json [state fold "--from" $from "--to" $to "--summary" $summary "--label" $label]
}
