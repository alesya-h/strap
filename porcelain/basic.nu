use ../nu/plumbing.nu *

# Starter model-editable porcelain. These commands are intentionally small and
# boring so future agents can rewrite, replace, or fork them cheaply.

export def ask [text: string] {
  $in | add-user $text
}

export def note [text: string] {
  $in | add-assistant $text
}

export def scope [label: string] {
  $in | open-scope $label
}

export def fold [summary: string] {
  $in | collapse-last-scope $summary
}

export def request-tool [tool: string, input: record] {
  $in | add-tool-request $tool $input
}

export def remember-porcelain-change [path: string, summary: string] {
  $in | add-trace porcelain-change { path: $path, summary: $summary }
}

export def show-last [] {
  $in | last-assistant-text
}
