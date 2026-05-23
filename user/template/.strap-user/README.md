# Strap User Work Directory

This directory contains user/agent-local runtime state. It should be ignored by the project VCS.

- `sessions/`: state files, traces, provider requests, tool results, and session-local jj history.
- `logs/`: runtime logs.
- `cache/`: disposable cache and derived indexes.
- `branches/`: branch/fork working state.
- `scratch/`: temporary files.
- `agents/`: user-local agent profile overlays.
- `skills/`: user-local skill instruction overlays.
- `models/`: user-local model profile overlays.
- `commands/`: temporary generated commands.
- `tools/`: temporary generated script tools.
- `zettel/`: private/local memory source.
