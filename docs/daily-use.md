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
# set STRAP_SESSION to the printed session dir before running session-aware commands
strap session ask "Analyze this repo"
strap session show \
| strap loop --tools all --max-turns 6 \
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
strap history log
strap zk list
strap zk tags
```

Inspect or explicitly snapshot active-session state with jj:

```bash
strap history log
strap history snapshot --message "after initial repo analysis"
strap history log
```

For parallel work, prefer explicit session selection. In bash, use a one-command wrapper:

```bash
strap with-session repo-analysis strap history log
```

In Nushell, select the session into the current shell environment:

```nu
strap session select repo-analysis
strap session select  # choose interactively with sk
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
strap artifact workon tool json_echo
strap artifact status tool
strap artifact promote tool json_echo
```

Apply an agent profile to a state:

```nu
strap agents list
strap skills list
open state.json | to json | ^strap agents apply chat-concise | ^strap skills apply concise | save -f concise-state.json
```

Use Nu with the process command surface for local structured state work:

```nu
strap state init
| to json
| ^strap agents apply chat-concise
| from json
| to json
| ^strap skills apply concise
| from json
```

Command-local `run.elv` native implementations and `run.nu` adapters/legacy implementations are not cross-command import surfaces.

Use process filters for state combinators:

```nu
open --raw state.json | ^strap state with-events -- jq 'map(select(.from == "user"))' | from json
open --raw state.json | ^strap state map-events -- jq '. + {"reviewed": true}' | from json
```

Fold stale context by placing bookmarks on unique text and folding the range:

```nu
strap session show | save -f state.json
open state.json | to json | ^strap state bookmark add --text "first unique phrase" --label fold-start | save -f marked-1.json
open marked-1.json | to json | ^strap state bookmark add --text "last unique phrase" --label fold-end | save -f marked-2.json
open marked-2.json | to json | ^strap state bookmark list | from json
open marked-2.json | to json | ^strap state extract --from bm_start --to bm_end | ^strap context quote | save -f quote.json
open quote.json | to json | ^strap context summarize "only architectural decisions and unresolved risks" --tools none | save -f summary.json
open marked-2.json | to json | ^strap state fold --from bm_start --to bm_end --summary "What this range established." | save -f folded.json
open folded.json | to json | ^strap session save
```

Use the actual bookmark IDs from `bookmark list` in the `fold` command.

Copy a session to continue in another direction:

```nu
strap session copy "alternative direction"
strap session copy "alternative from bookmark" --at bm_start
```
