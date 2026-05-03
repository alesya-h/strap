def strap-bin [] {
  $env.STRAP_BIN? | default ($env.STRAP_ROOT | path join bin strap)
}

def present [item: any] {
  not ((($item | describe) =~ '^string') and ($item == ""))
}

export def parts [sub: any, args: list<any>] {
  [($sub | default "")] | append $args | where {|item| present $item }
}

export def external [input: any, parts: list<any>] {
  if ($parts | is-empty) {
    error make { msg: "Expected a closure, '-- <command> [args...]', or '<strap-command> [args...]'" }
  }

  let first = ($parts | first)
  if (($first | describe) =~ "closure") {
    if (($parts | length) != 1) { error make { msg: "Closure transforms must be the only transform argument" } }
    return (do $first $input)
  }

  let words = ($parts | each {|part| $part | into string })
  let command = if (($words | first) == "--") { $words | skip 1 } else { [(strap-bin)] | append $words }
  if ($command | is-empty) { error make { msg: "Expected command after --" } }
  $input | to json | run-external ($command | first) ...($command | skip 1) | from json
}

export def list [items: list<any>, parts: list<any>] {
  external $items $parts
}

export def one [item: any, parts: list<any>] {
  external $item $parts
}
