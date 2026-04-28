# Strap User Work Directory

This directory contains user/agent-local runtime state. It should be ignored by the project VCS.

- `history/`: optional jj-backed state history.
- `sessions/`: state files, traces, provider requests, and tool results.
- `logs/`: runtime logs.
- `cache/`: disposable cache and derived indexes.
- `branches/`: branch/fork working state.
- `scratch/`: temporary files.
- `agents/`: user-local agent profile overlays.
- `skills/`: user-local skill instruction overlays.
- `models/`: user-local model profile overlays.
- `commands/`: temporary generated commands.
- `tools/`: temporary generated script tools.
- `porcelain/`: temporary generated Nushell porcelain.
- `zettel/`: private/local memory source.
- `config/`: user-local project config.
