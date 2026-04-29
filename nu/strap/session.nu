use ./common.nu *

export def --env new [name: string] {
  let result = (call-json [session new $name])
  $env.STRAP_SESSION = $result.dir
  $result
}

export def --env copy [name: string, --at: string = ""] {
  let result = (call-json ([session copy $name] ++ (maybe-flag "--at" $at)))
  $env.STRAP_SESSION = $result.dir
  $result
}

export def --env select [session?: string] {
  let selection = if ($session | is-empty) { choose-session } else { $session }
  $env.STRAP_SESSION = (call-text [session resolve $selection] | str trim)
  $env.STRAP_SESSION
}

def choose-session [] {
  if (which sk | is-empty) {
    error make { msg: "strap session select requires `sk` when no session argument is provided" }
  }
  let sessions = (call-json [session list])
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

export def list [] { call-json [session list] }
export def resolve [session: string] { call-text [session resolve $session] }
export def path [] { call-text [session path] }
export def trace [] { call-text [session trace] }
export def ask [text: string] { call-json [session ask $text] }
export def show [] { call-json [session show] }
export def save [] { $in | filter-json [session save] }
export def state [] { call-text [session state] }
