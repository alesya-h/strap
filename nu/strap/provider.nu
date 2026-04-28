use ./common.nu *

export def list [] { call-json [provider list] }
export def "chatgpt compile" [--model: string = "current", --tools: string = "all"] { $in | filter-json [provider chatgpt compile "--model" $model "--tools" $tools] }
export def "chatgpt call" [--model: string = "current", --tools: string = "all"] { $in | filter-json [provider chatgpt call "--model" $model "--tools" $tools] }
export def "chatgpt complete" [--model: string = "current", --tools: string = "all"] { $in | filter-json [provider chatgpt complete "--model" $model "--tools" $tools] }
export def "openai compile" [--model: string = "gpt-5.1-openai", --tools: string = "all"] { $in | filter-json [provider openai compile "--model" $model "--tools" $tools] }
export def "openai call" [--model: string = "gpt-5.1-openai", --tools: string = "all"] { $in | filter-json [provider openai call "--model" $model "--tools" $tools] }
export def "openai complete" [--model: string = "gpt-5.1-openai", --tools: string = "all"] { $in | filter-json [provider openai complete "--model" $model "--tools" $tools] }
export def "openrouter compile" [--model: string = "openai-gpt-5.1-openrouter", --tools: string = "all"] { $in | filter-json [provider openrouter compile "--model" $model "--tools" $tools] }
export def "openrouter call" [--model: string = "openai-gpt-5.1-openrouter", --tools: string = "all"] { $in | filter-json [provider openrouter call "--model" $model "--tools" $tools] }
export def "openrouter complete" [--model: string = "openai-gpt-5.1-openrouter", --tools: string = "all"] { $in | filter-json [provider openrouter complete "--model" $model "--tools" $tools] }
export def "anthropic compile" [--model: string = "claude-sonnet-4.5-anthropic", --tools: string = "all"] { $in | filter-json [provider anthropic compile "--model" $model "--tools" $tools] }
export def "anthropic call" [--model: string = "claude-sonnet-4.5-anthropic", --tools: string = "all"] { $in | filter-json [provider anthropic call "--model" $model "--tools" $tools] }
export def "anthropic complete" [--model: string = "claude-sonnet-4.5-anthropic", --tools: string = "all"] { $in | filter-json [provider anthropic complete "--model" $model "--tools" $tools] }
export def "chatgpt auth login" [--no-open, --timeout-seconds: int = 300] { call-json ([provider chatgpt auth login "--timeout-seconds" $timeout_seconds] ++ (maybe-switch "--no-open" $no_open)) }
export def "chatgpt auth import-codex" [--auth-file: string = ""] { call-json ([provider chatgpt auth import-codex] ++ (maybe-flag "--auth-file" $auth_file)) }
export def "chatgpt auth show" [] { call-json [provider chatgpt auth show] }
export def "chatgpt auth refresh" [] { call-json [provider chatgpt auth refresh] }
export def "chatgpt auth logout" [] { call-json [provider chatgpt auth logout] }
