# Subprojects

`strap` is organized as a set of capability subprojects rather than one monolithic CLI.

- `cli/`: filesystem-discovered command runner and built-in command directories.
- Future subprojects should group code by capability, not implementation type.

Current compatibility code still lives in top-level `bin/`, `src/`, `mcp-servers/`, `porcelain/`, and `tools/` while the command surface moves toward `strap <command>`.
