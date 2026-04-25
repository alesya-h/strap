use ../nu/plumbing.nu *

# Self-modification helpers. These do not grant capability by themselves; they
# make porcelain changes visible in state so branches can be compared/folded.

export def changed [path: string, summary: string] {
  $in | add-trace porcelain-change { path: $path, summary: $summary }
}

export def experiment [label: string] {
  $in | open-scope $"porcelain experiment: ($label)" | add-trace porcelain-experiment { label: $label }
}

export def keep [summary: string] {
  $in | collapse-last-scope $"Kept porcelain experiment: ($summary)"
}

export def discard [summary: string] {
  $in | collapse-last-scope $"Discarded porcelain experiment: ($summary)"
}
