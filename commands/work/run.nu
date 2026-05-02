#!/usr/bin/env nu

const project_dirs = [agents skills models commands tools zettel config]
const work_dirs = [agents skills models sessions logs cache branches scratch commands tools zettel config]

def usage [] { error make { msg: "Usage: strap work <init|path>" } }

export def main [command: string = "init"] {
  match $command {
    "init" => {
      mkdir $env.STRAP_PROJECT
      mkdir $env.STRAP_WORK
      for dir in $project_dirs { mkdir ($env.STRAP_PROJECT | path join $dir) }
      for dir in $work_dirs { mkdir ($env.STRAP_WORK | path join $dir) }
      let project_readme = ($env.STRAP_PROJECT | path join README.md)
      if not ($project_readme | path exists) {
        "# Strap Project\n\nProject-shared harness artifacts. This directory may be committed with the project.\n\n- agents/\n- skills/\n- models/\n- commands/\n- tools/\n- zettel/\n- config/\n" | save -f $project_readme
      }
      let work_readme = ($env.STRAP_WORK | path join README.md)
      if not ($work_readme | path exists) {
        "# Strap User Work\n\nUser/agent-local mutable harness state. This directory should be ignored by the project VCS. Session-local history is stored inside each session directory.\n\n- agents/\n- skills/\n- models/\n- sessions/\n- logs/\n- cache/\n- branches/\n- scratch/\n- commands/\n- tools/\n- zettel/\n- config/\n" | save -f $work_readme
      }
      { ok: true, project: $env.STRAP_PROJECT, work: $env.STRAP_WORK, project_dirs: $project_dirs, work_dirs: $work_dirs }
    }
    "path" => { { project: $env.STRAP_PROJECT, work: $env.STRAP_WORK } }
    _ => { usage }
  }
}
