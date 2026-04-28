def strap-bin [] {
  if (($env.STRAP_BIN? | default "") != "") {
    $env.STRAP_BIN
  } else {
    "strap"
  }
}

export def call-json [args: list<any>] {
  run-external (strap-bin) ...($args | each {|arg| $arg | into string }) | from json
}

export def call-text [args: list<any>] {
  run-external (strap-bin) ...($args | each {|arg| $arg | into string })
}

export def filter-json [args: list<any>] {
  $in | to json | run-external (strap-bin) ...($args | each {|arg| $arg | into string }) | from json
}

export def filter-text [args: list<any>] {
  $in | to json | run-external (strap-bin) ...($args | each {|arg| $arg | into string })
}

export def maybe-flag [name: string, value: any] {
  if ($value == null) or (($value | into string) == "") { [] } else { [$name $value] }
}

export def maybe-switch [name: string, enabled: bool] {
  if $enabled { [$name] } else { [] }
}
