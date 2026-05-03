def strap-bin [] { $env.STRAP_BIN? | default ($env.STRAP_ROOT | path join bin strap) }

export def load [name: string] {
  run-external (strap-bin) model show $name | from json
}
