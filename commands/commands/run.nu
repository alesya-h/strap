#!/usr/bin/env nu

def command-dirs [] {
  let configured = ($env.STRAP_COMMAND_PATH? | default "" | split row ":" | where {|item| $item != "" })
  let session = if (($env.STRAP_SESSION? | default "") == "") { [] } else { [($env.STRAP_SESSION | path join overlay commands)] }
  $configured | append $session | append [($env.STRAP_WORK | path join commands) ($env.STRAP_PROJECT | path join commands) ($env.STRAP_GLOBAL | path join commands) ($env.STRAP_ROOT | path join commands)]
}

def read-desc [dir: string] {
  let file = ($dir | path join desc)
  if ($file | path exists) { open --raw $file | lines | first | default "" } else { "" }
}

def manifest [name: string, dir: string] {
  let inner_dir = ($dir | path join inner)
  let run = ($dir | path join run)
  let run_nu = ($dir | path join run.nu)
  {
    name: $name
    description: (read-desc $dir)
    hasRun: ($run | path exists)
    hasRunNu: ($run_nu | path exists)
    nuEntrypoint: (if ($run_nu | path exists) { $run_nu } else { $run })
    nuEntrypointKind: (if ($run_nu | path exists) { "native" } else { "process-fallback" })
    hasSpec: (($dir | path join spec.yaml) | path exists)
    hasDynamicCompletion: ((($dir | path join carapace-complete) | path exists) or (($dir | path join compgen) | path exists))
    inner: (if ($inner_dir | path exists) { ls $inner_dir | sort-by name | get name | each {|item| $item | path basename } } else { [] })
    dir: $dir
  }
}

def command-items [] {
  mut found = {}
  for root in ((command-dirs) | reverse) {
    if not ($root | path exists) { continue }
    for entry in (ls $root | where type == dir) {
      let dir = $entry.name
      let run = ($dir | path join run)
      if not ($run | path exists) { continue }
      let name = ($dir | path basename)
      $found = ($found | upsert $name {
        name: $name
        dir: $dir
        hidden: (($dir | path join hide) | path exists)
        description: (read-desc $dir)
        manifest: (manifest $name $dir)
      })
    }
  }
  $found | transpose key item | get item | sort-by name
}

def is-executable [file: string] { (^test -x $file | complete).exit_code == 0 }

def has-shebang [file: string] { (open --raw $file | lines | first | default "") =~ '^#!' }

def valid-name [name: string] { $name =~ '^[a-z][a-z0-9-]*$' }

def validate-item [item: record] {
  mut errors = []
  mut warnings = []
  let run = ($item.dir | path join run)
  let run_nu = ($item.dir | path join run.nu)
  let desc = ($item.dir | path join desc)

  if not (valid-name $item.name) { $errors = ($errors | append "name must match [a-z][a-z0-9-]*") }
  if not ($run | path exists) {
    $errors = ($errors | append "missing run")
  } else {
    if not (is-executable $run) { $errors = ($errors | append "run is not executable") }
    if not (has-shebang $run) { $errors = ($errors | append "run missing shebang") }
  }
  if not ($run_nu | path exists) { $warnings = ($warnings | append "missing optional run.nu") }
  if not ($desc | path exists) { $errors = ($errors | append "missing desc") } else if ((read-desc $item.dir) == "") { $errors = ($errors | append "desc first line is empty") }

  let inner_dir = ($item.dir | path join inner)
  if ($inner_dir | path exists) {
    for inner in (ls $inner_dir | where type == file) {
      if not (is-executable $inner.name) { $warnings = ($warnings | append $"inner/($inner.name | path basename) is not executable") }
    }
  }

  { name: $item.name, dir: $item.dir, ok: (($errors | length) == 0), errors: $errors, warnings: $warnings, manifest: $item.manifest }
}

def active-work-root [] {
  if (($env.STRAP_SESSION? | default "") == "") { $env.STRAP_WORK } else { $env.STRAP_SESSION | path join overlay }
}

def usage [] { error make { msg: "Usage: strap commands <list|manifest|validate|new|roots> [args]" } }

export def main [command?: string, name?: string, --json, --all] {
  match ($command | default "") {
    "list" => {
      let items = (command-items | where {|item| $all or not $item.hidden })
      if $json { $items } else { $items | each {|item| $"($item.name)\t($item.description)" } | str join "\n" }
    }
    "roots" => {
      {
        root: $env.STRAP_ROOT
        global: $env.STRAP_GLOBAL
        project: $env.STRAP_PROJECT
        work: $env.STRAP_WORK
        session: (if (($env.STRAP_SESSION? | default "") == "") { null } else { $env.STRAP_SESSION | path join overlay })
        active_work: (active-work-root)
        command_dirs: (command-dirs)
      }
    }
    "manifest" => {
      let matches = (command-items | where name == $name)
      if ($matches | is-empty) { error make { msg: $"Command not found: ($name)" } }
      $matches | first | get manifest
    }
    "validate" => {
      let selected = if (($name | default "") == "") { command-items } else { command-items | where name == $name }
      if (($name | default "") != "") and ($selected | is-empty) { error make { msg: $"Command not found: ($name)" } }
      let results = ($selected | each {|item| validate-item $item })
      if $json { $results } else {
        $results | each {|result|
          let status = if $result.ok { "ok" } else { "fail" }
          let messages = ($result.errors | append $result.warnings | str join "; ")
          $"($status)\t($result.name)\t($messages)"
        } | str join "\n"
      }
    }
    "new" => {
      if not (valid-name $name) { error make { msg: "Command name must match [a-z][a-z0-9-]*" } }
      let dir = (active-work-root | path join commands $name)
      if ($dir | path exists) { error make { msg: $"Command already exists: ($dir)" } }
      mkdir ($dir | path join inner)
      $"#!/usr/bin/env bash\nset -euo pipefail\n\nprintf '%s\\n' '($name): implement me'\n" | save -f ($dir | path join run)
      chmod +x ($dir | path join run)
      $"($name) command.\n\nUsage:\n  strap ($name)\n" | save -f ($dir | path join desc)
      { ok: true, name: $name, dir: $dir }
    }
    _ => { usage }
  }
}
