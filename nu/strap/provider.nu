use ../../commands/provider/run.nu

def maybe-switch [name: string, enabled: bool] {
  if $enabled { [$name] } else { [] }
}

def maybe-flag [name: string, value: any] {
  if ($value == null) or (($value | into string) == "") { [] } else { [$name $value] }
}

def provider-filter [provider: string, command: string, model: string, tools: string] {
  $in | run ...[$provider $command "--model" $model "--tools" $tools] --stdin
}

export def list [] { run ...[list] }

export def "chatgpt compile" [--model: string = "current", --tools: string = "all"] {
  $in | provider-filter chatgpt compile $model $tools
}

export def "chatgpt call" [--model: string = "current", --tools: string = "all"] {
  $in | provider-filter chatgpt call $model $tools
}

export def "chatgpt complete" [--model: string = "current", --tools: string = "all"] {
  $in | provider-filter chatgpt complete $model $tools
}

export def "openai compile" [--model: string = "gpt-5.1-openai", --tools: string = "all"] {
  $in | provider-filter openai compile $model $tools
}

export def "openai call" [--model: string = "gpt-5.1-openai", --tools: string = "all"] {
  $in | provider-filter openai call $model $tools
}

export def "openai complete" [--model: string = "gpt-5.1-openai", --tools: string = "all"] {
  $in | provider-filter openai complete $model $tools
}

export def "openrouter compile" [--model: string = "openai-gpt-5.1-openrouter", --tools: string = "all"] {
  $in | provider-filter openrouter compile $model $tools
}

export def "openrouter call" [--model: string = "openai-gpt-5.1-openrouter", --tools: string = "all"] {
  $in | provider-filter openrouter call $model $tools
}

export def "openrouter complete" [--model: string = "openai-gpt-5.1-openrouter", --tools: string = "all"] {
  $in | provider-filter openrouter complete $model $tools
}

export def "anthropic compile" [--model: string = "claude-sonnet-4.5-anthropic", --tools: string = "all"] {
  $in | provider-filter anthropic compile $model $tools
}

export def "anthropic call" [--model: string = "claude-sonnet-4.5-anthropic", --tools: string = "all"] {
  $in | provider-filter anthropic call $model $tools
}

export def "anthropic complete" [--model: string = "claude-sonnet-4.5-anthropic", --tools: string = "all"] {
  $in | provider-filter anthropic complete $model $tools
}

export def "chatgpt auth login" [--no-open, --timeout-seconds: int = 300] {
  run ...([chatgpt auth login "--timeout-seconds" $timeout_seconds] ++ (maybe-switch "--no-open" $no_open))
}

export def "chatgpt auth import-codex" [--auth-file: string = ""] {
  run ...([chatgpt auth import-codex] ++ (maybe-flag "--auth-file" $auth_file))
}

export def "chatgpt auth show" [] { run ...[chatgpt auth show] }

export def "chatgpt auth refresh" [] { run ...[chatgpt auth refresh] }

export def "chatgpt auth logout" [] { run ...[chatgpt auth logout] }
