use ./common.nu *

export def compile [--provider: string, --tools: string = "all"] { $in | filter-json [llm compile "--provider" $provider "--tools" $tools] }
export def compile-openai [--model: string = "gpt-5.1", --tools: string = "all"] { $in | filter-json [llm compile-openai "--model" $model "--tools" $tools] }
export def complete [--provider: string, --tools: string = "all"] { $in | filter-json [llm complete "--provider" $provider "--tools" $tools] }
export def complete-openai [--model: string = "gpt-5.1", --tools: string = "all"] { $in | filter-json [llm complete-openai "--model" $model "--tools" $tools] }
