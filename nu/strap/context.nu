use ./common.nu *

export def quote [] { $in | filter-json [context quote] }
export def render [] { $in | filter-text [context render] }
export def summarize [framing: string, --model: string = "current", --agent: string = "", --skill: list<string> = [], --tools: string = "none", --dry-run] {
  let skill_args = ($skill | reduce --fold [] {|name, acc| $acc ++ ["--skill" $name] })
  $in | filter-json ([context summarize $framing "--model" $model "--tools" $tools] ++ (maybe-flag "--agent" $agent) ++ $skill_args ++ (maybe-switch "--dry-run" $dry_run))
}
