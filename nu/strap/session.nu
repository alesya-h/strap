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

export def --env select [session: string] {
  $env.STRAP_SESSION = (call-text [session resolve $session] | str trim)
  $env.STRAP_SESSION
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
