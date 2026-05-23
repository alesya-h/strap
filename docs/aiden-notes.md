# Aiden Notes: Self-Modifying Harness Predecessor

`/home/alesya/p/aiden` contains an older Ruby harness built before provider-native tool calls were common. I only reviewed Ruby files:

- `aiden.rb`
- `aiden_self.rb`

## What Aiden Did

The loop was:

1. Keep conversation history in `msgs.yaml`.
2. Send history to Anthropic Messages.
3. Treat model text as Ruby code, after stripping code fences.
4. Ask the human to inspect/confirm the code.
5. Evaluate the code with `$aiden.instance_eval`.
6. Capture stdout/stderr/errors and append that captured output as the next user message.
7. Persist history.

The interesting object model:

```ruby
$alesya = Object.new
$alesya.instance_eval do
  def tell(s) ... end
  def ask(s) ... end
end

$aiden = Object.new
$aiden.instance_eval do
  def alesya
    $alesya
  end

  def eval_and_persist(code)
    File.write("aiden_self.rb", code, mode: "a+")
    eval(code)
  end
end

$aiden.instance_eval(File.read "aiden_self.rb")
```

So the model effectively inhabited a persistent Ruby object. It could define new methods for itself by writing to `aiden_self.rb`, and those methods would be loaded into future runs.

## Why It Did Not Age Directly Into strap

Raw model-written `eval` is now the wrong primitive:

- tool calls give us structured intent instead of hoping model text is executable code
- arbitrary eval collapses planning, permissions, execution, and persistence into one unsafe operation
- provenance and rollback are poor if new methods are appended into one mutable file
- failures become transcript text rather than typed tool results

But the core idea is still valuable: **the harness should be able to grow new capabilities during use**.

## Modernized Interpretation For strap

The safe version is not “eval assistant code.” It is “propose and install new tool modules as data/code artifacts.”

In strap terms:

1. A model proposes a new capability as a script tool:
   - executable script
   - grouped tool action metadata with schema and description
   - tests or smoke examples
2. The proposal lives in a scope or child agent branch.
3. The harness runs validation in a sandbox.
4. A human approval gate approves installation.
5. Once installed, the tool appears through a `STRAP_PATH` layer or a future tool registry.
6. The canonical state records the installation event and provenance.

This preserves Aiden’s self-extension loop while using current tool-call machinery.

## Design Pattern To Keep

### Persistent actor self

Aiden’s `$aiden` object is an ancestor of strap’s actor model:

- `$aiden` persistent methods → `actors.agents.<agent>.self` plus installed tools
- `$alesya.tell/ask` → user-facing event/call tools
- `aiden_self.rb` → versioned capability bundle or script tool directory
- captured stdout as next user message → structured tool result event

### Self-modification as branch/fold

Self-modification should happen as a branch, not directly in the main context:

```bash
state \
| strap agent fork --prompt "Design a new script tool for X" \
> child.json

# child proposes files, tests them, summarizes

state \
| strap agent fold --child child.json --summary "Installed tool X after tests" \
> next.json
```

The full exploratory subtree can stay hidden in the folded event.

## Possible Future Tools

These would bring Aiden’s spirit back safely:

- `tool_propose`: create a candidate script tool in a temp/staging directory.
- `tool_validate`: run syntax checks, schema checks, and smoke tests under bubblewrap.
- `tool_install`: move an approved tool into `tools/` or a configured registry path.
- `tool_list`: list currently installed first-party script tools and their provenance.
- `tool_retire`: disable or archive a tool.

Each of these can be exposed as MCP tools and as immutable state transforms.

## Important Constraint

The model should not get a hidden `eval_and_persist` equivalent. Self-extension should be explicit, inspectable, sandboxed, and reversible.
