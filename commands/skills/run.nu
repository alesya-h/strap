#!/usr/bin/env nu

def roots [] {
  let strap = ($env.STRAP_BIN? | default ($env.STRAP_ROOT | path join bin strap))
  run-external $strap layers roots skill | from json | get root
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
  { meta_lines: ($lines | skip 1 | take ($end_index - 1)), body: ($lines | skip ($end_index + 1) | str join "\n" | str trim) }
}

def read-skill [file: string, fallback_name: string, include_paths: bool] {
  let parsed = (open --raw $file | split-frontmatter)
  let name = (meta-value $parsed.meta_lines "name" | default $fallback_name)
  let base = {
    name: $name
    description: (meta-value $parsed.meta_lines "description" | default "")
    instructions: $parsed.body
    source: (($file | path dirname | path basename) | path join ($file | path basename))
  }
  if $include_paths { $base | insert path $file } else { $base }
}

def list-skills [include_paths: bool] {
  mut seen = []
  mut out = []
  for root in (roots) {
    if not ($root | path exists) { continue }
    for entry in (ls $root | where type == dir) {
      let name = ($entry.name | path basename)
      let file = ($entry.name | path join SKILL.md)
      if ($name in $seen) or not ($file | path exists) { continue }
      $seen = ($seen | append $name)
      $out = ($out | append (read-skill $file $name $include_paths))
    }
  }
  $out | sort-by name
}

def load-skill [name: string, include_paths: bool] {
  for root in (roots) {
    let file = ($root | path join $name SKILL.md)
    if ($file | path exists) { return (read-skill $file $name $include_paths) }
  }
  error make { msg: $"Skill not found: ($name)" }
}

def apply-skill [profile: record, actor_id: string] {
  let state = $in
  let current = ($state.actors | get --optional $actor_id | default { kind: "agent", self: {}, peers: {} })
  let skills = ($current.skills? | default [])
  let next_skills = if ($profile.name in $skills) { $skills } else { $skills | append $profile.name }
  let existing_profiles = ($current.skill_profiles? | default [] | where name != $profile.name)
  let actor = ($current
    | upsert kind ($current.kind? | default "agent")
    | upsert self ($current.self? | default {})
    | upsert skills $next_skills
    | upsert skill_profiles ($existing_profiles | append { name: $profile.name, description: $profile.description, source: $profile.source })
    | upsert skill_instructions (($current.skill_instructions? | default {}) | upsert $profile.name $profile.instructions))
  $state | update actors { upsert $actor_id $actor }
}

def usage [] { error make { msg: "Usage: strap skills <list|show|apply|roots|import-opencode> [args]" } }

export def main [command?: string, name?: string, --paths, --actor: string = "assistant"] {
  let input = $in
  match ($command | default "") {
    "list" => { list-skills $paths | each {|item| $item | reject instructions } }
    "show" => { if ($name | is-empty) { usage }; load-skill $name $paths }
    "apply" => { if ($name | is-empty) { usage }; $input | apply-skill (load-skill $name true) $actor }
    "roots" => { roots }
    "import-opencode" => {
      let source = ($name | default ($env.HOME | path join .config opencode skills))
      let target = (($env.STRAP_WORK? | default ((pwd) | path join .strap-user)) | path join skills)
      mkdir $target
      mut imported = []
      for entry in (ls $source | where type == dir) {
        let name = ($entry.name | path basename)
        cp -r $entry.name $target
        $imported = ($imported | append { name: $name, path: ($target | path join $name) })
      }
      { ok: true, imported: $imported }
    }
    _ => { usage }
  }
}
