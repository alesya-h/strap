def root [] { $env.STRAP_ROOT? | default (pwd) }

def strap-bin [] { $env.STRAP_BIN? | default (root | path join bin strap) }

def resolve-session [session: string] {
  run-external (strap-bin) session resolve $session | str trim
}

export def main [session: string, block: closure] {
  let dir = (resolve-session $session)
  with-env { STRAP_SESSION: $dir } { do $block }
}
