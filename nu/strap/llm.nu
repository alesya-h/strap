use ./common.nu *

export def compile [--model: string = "current", --tools: string = "all"] { $in | filter-json [llm compile "--model" $model "--tools" $tools] }
export def complete [--model: string = "current", --tools: string = "all"] { $in | filter-json [llm complete "--model" $model "--tools" $tools] }
export def call [--model: string = "current", --tools: string = "all"] { $in | filter-json [llm call "--model" $model "--tools" $tools] }
