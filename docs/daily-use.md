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
strap session show \
| strap loop-nu --provider config/strap/providers/chatgpt.json --tools all --max-turns 6 \
| tee session.json \
| strap session save
```

Store and recall useful conclusions through the zettelkasten:

```bash
strap zk create --scope user --title "Repo architecture" --body "Useful local observation." --tags session,summary
STRAP_ZK_EMBED_PROVIDER=hash strap zk search-hybrid "repo architecture"
```

Memory is explicit: use `strap zk` directly or let the agent call the `zk` tool. Session commands do not implicitly inject or write memory.

Inspect the work area:

```bash
strap status
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
strap zk backlinks "Session note"
STRAP_ZK_EMBED_PROVIDER=hash strap zk reindex --scope all
```

Add user-local temporary commands:

```bash
strap commands new repo-check
strap edit repo-check
strap commands list --json
strap commands validate --json
```

Work on and promote overlayed artifacts:

```bash
strap artifact workon porcelain basic
strap artifact status porcelain
strap artifact promote porcelain basic
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

```nu
strap session show | save -f state.json
open state.json | strap state bookmark add --text "first unique phrase" --label fold-start | save -f marked-1.json
open marked-1.json | strap state bookmark add --text "last unique phrase" --label fold-end | save -f marked-2.json
open marked-2.json | strap state bookmark list
open marked-2.json | strap state extract --from bm_start --to bm_end | strap context quote | save -f quote.json
open quote.json | strap one-shot run "Summarize only architectural decisions and unresolved risks" --provider config/strap/providers/chatgpt.json --tools none | save -f one-shot-result.json
open marked-2.json | strap state fold --from bm_start --to bm_end --summary "What this range established." | save -f folded.json
open folded.json | strap session save
```

Use the actual bookmark IDs from `bookmark list` in the `fold` command.

Copy a session to continue in another direction:

```nu
strap session copy "alternative direction"
strap session copy "alternative from bookmark" --at bm_start
```
