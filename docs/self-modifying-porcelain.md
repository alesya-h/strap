# Self-Modifying Porcelain

This harness is designed to make model-authored automation cheap.

The architecture is intentionally close to git's plumbing/porcelain split:

- **Plumbing** is the stable substrate: small immutable state transforms and effect bridges.
- **Porcelain** is model-editable workflow code: loops, strategies, critics, repo-specific helpers, and temporary domain languages.

The flexible design goal is: a model can write new porcelain, run it against a forked state, keep or discard it, and continue without needing a registration ceremony.

## Current Layout

```text
nu/plumbing.nu          stable Nushell state primitives
nu/strap.nu             ergonomic wrappers around strap subproject commands
porcelain/basic.nu      starter model-editable state helpers
porcelain/loop.nu       editable reference completion/tool loop
porcelain/self.nu       starter self-modification trace helpers
strap porcelain ...     generic runner for Nu porcelain modules
```

Node remains the bridge for provider calls, MCP/jsmcp, and process/web integration. Nu is the preferred language for porcelain because structured JSON pipelines are native.

## Running Porcelain

List modules:

```bash
strap porcelain list
```

Run a porcelain command as an immutable state filter:

```bash
strap state init \
| strap porcelain run basic ask "List files" \
| strap porcelain run basic scope "repo scan"
```

Arguments are parsed as JSON when possible, otherwise they are passed as strings:

```bash
strap state init \
| strap porcelain run basic request-tool grep_files '{"pattern":"TODO"}'
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
| strap porcelain run repo-debug debug-loop "npm test"
```

Useful porcelain changes should be recorded in state as trace events:

```bash
state \
| strap porcelain run self changed porcelain/repo-debug.nu "Added npm test debug loop"
```

The trace is not an approval mechanism. It is provenance for later folding, comparison, pruning, and packaging.

## Safety Boundary

This layer intentionally prioritizes flexibility. Generated porcelain and the tools it calls should be treated as powerful unless the process is launched inside a restrictive environment.

The safety model should live around it:

- run generated porcelain under bubblewrap
- make real effects reachable only through jsmcp/MCP capability servers
- use overlays/tmpfs for speculative filesystem work
- give each branch least-privilege tool servers
- optionally add eBPF/seccomp/network policy outside the harness
- use restricted MCP/jsmcp profiles for restricted runs

In other words: let the model mutate porcelain freely, but ensure the process has no ambient authority worth stealing.

## Design Rules

- Porcelain should be easy to throw away.
- Plumbing should stay small and boring.
- New porcelain should not require registration.
- Branch/fold is the default way to try workflow changes.
- Capability should come from external tool servers, not from hidden ambient process rights.
- A broken porcelain script is just a bad branch, not a corrupted session.
