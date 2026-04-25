# Self-Modifying Porcelain

This harness is designed to make model-authored automation cheap.

The architecture is intentionally close to git's plumbing/porcelain split:

- **Plumbing** is the stable substrate: small immutable state transforms and effect bridges.
- **Porcelain** is model-editable workflow code: loops, strategies, critics, repo-specific helpers, and temporary domain languages.

The flexible design goal is: a model can write new porcelain, run it against a forked state, keep or discard it, and continue without needing a registration ceremony.

## Current Layout

```text
nu/plumbing.nu        stable Nushell state primitives
nu/strap.nu           ergonomic wrappers around Node filters
porcelain/basic.nu    starter model-editable state helpers
porcelain/loop.nu     starter completion/tool loop helpers
porcelain/self.nu     starter self-modification trace helpers
bin/strap-porcelain.js  generic runner for Nu porcelain modules
```

Node remains the bridge for provider calls, MCP/jsmcp, and process/web integration. Nu is the preferred language for porcelain because structured JSON pipelines are native.

## Running Porcelain

List modules:

```bash
node bin/strap-porcelain.js list
```

Run a porcelain command as an immutable state filter:

```bash
node bin/strap-state.js init \
| node bin/strap-porcelain.js run basic ask "List files" \
| node bin/strap-porcelain.js run basic scope "repo scan"
```

Arguments are parsed as JSON when possible, otherwise they are passed as strings:

```bash
node bin/strap-state.js init \
| node bin/strap-porcelain.js run basic request-tool grep_files '{"pattern":"TODO"}'
```

Porcelain lookup uses:

1. explicit file path
2. explicit file path plus `.nu`
3. module name in `STRAP_PORCELAIN_PATH`
4. module name in `./porcelain`

## Self-Modification Flow

A model can create or edit porcelain directly:

```bash
mkdir -p porcelain
$EDITOR porcelain/repo-debug.nu
```

Then immediately run it:

```bash
state \
| node bin/strap-porcelain.js run repo-debug debug-loop "npm test"
```

Useful porcelain changes should be recorded in state as trace events:

```bash
state \
| node bin/strap-porcelain.js run self changed porcelain/repo-debug.nu "Added npm test debug loop"
```

The trace is not an approval mechanism. It is provenance for later folding, comparison, pruning, and packaging.

## Safety Boundary Later

This layer intentionally prioritizes flexibility.

The safety model should live around it:

- run generated porcelain under bubblewrap
- make real effects reachable only through jsmcp/MCP capability servers
- use overlays/tmpfs for speculative filesystem work
- give each branch least-privilege tool servers
- optionally add eBPF/seccomp/network policy outside the harness

In other words: let the model mutate porcelain freely, but ensure the process has no ambient authority worth stealing.

## Design Rules

- Porcelain should be easy to throw away.
- Plumbing should stay small and boring.
- New porcelain should not require registration.
- Branch/fold is the default way to try workflow changes.
- Capability should come from external tool servers, not from hidden ambient process rights.
- A broken porcelain script is just a bad branch, not a corrupted session.
