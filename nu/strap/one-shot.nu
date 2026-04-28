use ./common.nu *

export def run [task: string, --model: string = "current", --agent: string = "", --skill: list<string> = [], --tools: string = "none", --max-turns: int = 8, --dry-run] {
  let skill_args = ($skill | reduce --fold [] {|name, acc| $acc ++ ["--skill" $name] })
  $in | filter-json ([one-shot run $task "--model" $model "--tools" $tools "--max-turns" $max_turns] ++ (maybe-flag "--agent" $agent) ++ $skill_args ++ (maybe-switch "--dry-run" $dry_run))
}
