# Daily Use

A minimal project workflow:

If you use the ChatGPT/Codex backend provider, authenticate once first:

```bash
strap auth chatgpt login

# temporary migration path from an existing Codex login
strap auth chatgpt import-codex
```

```bash
strap work init
strap session new "repo analysis"
strap session ask "Analyze this repo"
strap session recall "repo architecture"
strap session show \
| strap loop-nu --provider config/strap/providers/chatgpt.json --tools all --max-turns 6 \
| tee session.json \
| strap session save
```

Store useful conclusions in the shared memory:

```bash
strap session remember session,summary
```

`recall` appends zettelkasten matches into the session state as visible `memory_context`. `remember` stores the latest useful assistant message from the current session state.

Inspect the work area:

```bash
strap work path
strap session list
strap session trace
strap zk list
strap zk tags
```

Snapshot user-local agent state with jj:

```bash
strap history init
strap history snapshot --message "after initial repo analysis"
strap history log
```

Create memory and rebuild the derived SQLite index:

```bash
strap zk create --scope user --title "Session note" --body "Useful local observation." --tags session
STRAP_ZK_EMBED_PROVIDER=hash strap zk reindex --scope all
```

Add user-local temporary commands:

```bash
strap commands new repo-check
strap edit repo-check
strap commands list --json
strap commands validate --json
```

Use the Babashka data-layer prototype:

```bash
strap state-bb init
strap state-bb init | strap state-bb add-user "hello"
```

Inspect authority decisions during development:

```bash
strap policy decide --policy readonly --action execute --command zk
strap policy decide --policy readonly --action write --path /etc/passwd
```

Fold stale context by placing bookmarks on unique text and folding the range:

```bash
strap session show > state.json
strap state bookmark add --text "first unique phrase" --label fold-start < state.json > marked-1.json
strap state bookmark add --text "last unique phrase" --label fold-end < marked-1.json > marked-2.json
strap state bookmark list < marked-2.json
strap state fold --from bm_start --to bm_end --summary "What this range established." < marked-2.json > folded.json
strap session save < folded.json
```

Use the actual bookmark IDs from `bookmark list` in the `fold` command.
