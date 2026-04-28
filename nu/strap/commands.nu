use ./common.nu *

export def list [--json] {
  if $json { call-json [commands list --json] } else { call-text [commands list] }
}

export def roots [] { call-json [commands roots] }
export def manifest [name: string] { call-json [commands manifest $name] }
export def validate [] { call-json [commands validate --json] }
export def new [name: string] { call-json [commands new $name] }
