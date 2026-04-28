use ./common.nu *

export def new [name: string] { call-json [session new $name] }
export def copy [name: string, --at: string = ""] { call-json ([session copy $name] ++ (maybe-flag "--at" $at)) }
export def list [] { call-json [session list] }
export def path [] { call-json [session path] }
export def trace [] { call-json [session trace] }
export def ask [text: string] { call-json [session ask $text] }
export def show [] { call-json [session show] }
export def save [] { $in | filter-json [session save] }
export def state [] { call-text [session state] }
