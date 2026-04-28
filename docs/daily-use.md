# Daily Use

A minimal project workflow:

If you use the ChatGPT/Codex backend provider, authenticate once first:

```bash
strap provider chatgpt auth login

# temporary migration path from an existing Codex login
strap provider chatgpt auth import-codex
```

```bash
strap work init
strap session new "repo analysis"
strap session ask "Analyze this repo"
strap session show \
| strap loop-nu --tools all --max-turns 6 \
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

Apply an agent profile to a state:

```nu
strap agents list
strap skills list
open state.json | strap agents apply chat-concise | strap skills apply concise | save -f concise-state.json
```

Use the Babashka data-layer prototype:

```bash
strap state-bb init
strap state-bb init | strap state-bb add-user "hello"
```

Use Nu plumbing for local structured state work:

```nu
use '/path/to/strap/nu/strap'

strap state init
| strap agents apply chat-concise
| strap skills apply concise
```

If `strap nu lib-dir` is in `NU_LIB_DIRS`, use the shorter import:

```nu
use strap
```

Use the lower-level plumbing module for block combinators:

```nu
use '/path/to/strap/nu/plumbing.nu' *

open state.json | with-events {|events| $events | where from == user }
open state.json | map-events {|event| { from: $event.from, text: $event.text } }
```

Find ready imports with `strap nu use-line strap` and `strap nu use-line plumbing`.

Inspect launch-policy decisions during development:

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
open quote.json | strap context summarize "only architectural decisions and unresolved risks" --tools none | save -f summary.json
open marked-2.json | strap state fold --from bm_start --to bm_end --summary "What this range established." | save -f folded.json
open folded.json | strap session save
```

Use the actual bookmark IDs from `bookmark list` in the `fold` command.

Copy a session to continue in another direction:

```nu
strap session copy "alternative direction"
strap session copy "alternative from bookmark" --at bm_start
```
