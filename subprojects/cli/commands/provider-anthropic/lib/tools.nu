export def load [group: string] {
  if $group == "none" { return [] }
  let js = ([
    "import { getTools, publicToolSpec } from '#strap/tools/registry'; "
    "console.log(JSON.stringify(getTools("
    ($group | to json --raw)
    ").map(publicToolSpec)));"
  ] | str join "")
  ^node --input-type=module -e $js | from json
}
