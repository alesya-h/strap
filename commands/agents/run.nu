#!/usr/bin/env nu

def roots [] {
  let strap = ($env.STRAP_BIN? | default ($env.STRAP_ROOT | path join bin strap))
  run-external $strap layers roots agent | from json | get root
}

def trim-quotes [] { $in | str trim | str replace -r '^"|"$' "" }

def meta-value [lines: list<string>, key: string] {
  let prefix = $"($key):"
  let matches = ($lines | where {|line| $line | str starts-with $prefix })
  if ($matches | is-empty) { null } else { ($matches | first | str replace $prefix "" | trim-quotes) }
}

def split-frontmatter [] {
  let text = $in
  let lines = ($text | lines)
  if (($lines | is-empty) or (($lines | first) != "---")) { return { meta_lines: [], body: $text } }
  let end = ($lines | skip 1 | enumerate | where item == "---" | first)
  if ($end | is-empty) { return { meta_lines: [], body: $text } }
  let end_index = ($end.index + 1)
  {
    meta_lines: ($lines | skip 1 | take ($end_index - 1))
    body: ($lines | skip ($end_index + 1) | str join "\n" | str trim)
  }
}

def read-profile [file: string, fallback_name: string, include_paths: bool] {
  let parsed = (open --raw $file | split-frontmatter)
  let name = (meta-value $parsed.meta_lines "name" | default $fallback_name)
  let description = (meta-value $parsed.meta_lines "description" | default "")
  let color = (meta-value $parsed.meta_lines "color")
  let base = {
    name: $name
    description: $description
    permission: null
    color: $color
    instructions: $parsed.body
    source: ($file | path basename)
  }
  if $include_paths { $base | insert path $file } else { $base }
}

def list-profiles [include_paths: bool] {
  mut seen = []
  mut out = []
  for root in (roots) {
    if not ($root | path exists) { continue }
    for entry in (ls $root | where type == file and name =~ '\.md$') {
      let name = ($entry.name | path parse | get stem)
      if ($name in $seen) { continue }
      $seen = ($seen | append $name)
      $out = ($out | append (read-profile $entry.name $name $include_paths))
    }
  }
  $out | sort-by name
}

def load-profile [name: string, include_paths: bool] {
  for root in (roots) {
    let file = ($root | path join $"($name).md")
    if ($file | path exists) { return (read-profile $file $name $include_paths) }
  }
  error make { msg: $"Agent not found: ($name)" }
}

def apply-profile [profile: record, actor_id: string] {
  let state = $in
  let agent_id = if $actor_id == "" { $profile.name } else { $actor_id }
  let agents = ($state.actors.agents? | default {})
  let current = ($agents | get --optional $agent_id | default { self: {}, peers: {} })
  let self = ($current.self? | default {} | upsert public (if $profile.description == "" { $current.self?.public? | default $"($profile.name) agent." } else { $profile.description }) | upsert private $profile.instructions)
  let actor = ($current | upsert self $self | upsert profile { name: $profile.name, description: $profile.description, source: $profile.source })
  $state | upsert actors.agents ($agents | upsert $agent_id $actor) | upsert runtime.active_agent $agent_id
}

def usage [] { error make { msg: "Usage: strap agents <list|show|apply|roots|import-opencode> [args]" } }

export def main [command?: string, name?: string, --paths, --actor: string = ""] {
  let input = $in
  match ($command | default "") {
    "list" => { list-profiles $paths | each {|item| $item | reject instructions } }
    "show" => { if ($name | is-empty) { usage }; load-profile $name $paths }
    "apply" => { if ($name | is-empty) { usage }; $input | apply-profile (load-profile $name true) $actor }
    "roots" => { roots }
    "import-opencode" => {
      let source = ($name | default ($env.HOME | path join .config opencode agents))
      let target = (($env.STRAP_WORK? | default ((pwd) | path join .strap-user)) | path join agents)
      mkdir $target
      mut imported = []
      for entry in (ls $source | where type == file and name =~ '\.md$') {
        cp $entry.name $target
        $imported = ($imported | append { name: ($entry.name | path parse | get stem), path: ($target | path join ($entry.name | path basename)) })
      }
      { ok: true, imported: $imported }
    }
    _ => { usage }
  }
}
