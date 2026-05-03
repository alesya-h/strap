use ../../commands/session/run.nu

def maybe-flag [name: string, value: any] {
  if ($value == null) or (($value | into string) == "") { [] } else { [$name $value] }
}

export def --env new [name: string] {
  let result = (run ...[new $name])
  $env.STRAP_SESSION = $result.dir
  $result
}

export def --env copy [name: string, --at: string = ""] {
  let result = (run ...([copy $name] ++ (maybe-flag "--at" $at)))
  $env.STRAP_SESSION = $result.dir
  $result
}

export def --env select [session?: string] {
  let selection = if ($session | is-empty) { choose-session } else { $session }
  $env.STRAP_SESSION = (run ...[resolve $selection] | str trim)
  $env.STRAP_SESSION
}

def choose-session [] {
  if (which sk | is-empty) {
    error make { msg: "strap session select requires `sk` when no session argument is provided" }
  }
  let sessions = (run ...[list])
  if ($sessions | is-empty) {
    error make { msg: "No strap sessions found" }
  }
  let selected = (
    $sessions
    | each {|session| [$session.name ($session.title? | default "") $session.dir] | str join "\t" }
    | str join "\n"
    | ^sk
    | str trim
  )
  if ($selected == "") {
    error make { msg: "No session selected" }
  }
  $selected | split row "\t" | get 0
}

export def --env clear [] {
  if (($env.STRAP_SESSION? | default "") != "") { hide-env STRAP_SESSION }
}

export def list [] { run ...[list] }

export def resolve [session: string] { run ...[resolve $session] }

export def path [] { run ...[path] }

export def trace [] { run ...[trace] }

export def ask [text: string] { run ...[ask $text] }

export def show [] { run ...[show] }

export def save [] { $in | run ...[save] }

export def state [] { run ...[state] }
