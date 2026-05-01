# Subprojects

`strap` is organized as a set of capability subprojects rather than one monolithic CLI.

- `strap-main/`: Babashka main command dispatcher behind `bin/strap`.
- `cli/`: built-in command capsules.
- `state-bb/`: Babashka pure-state prototype.

Subprojects group code by capability, not implementation type. Public access should still go through `strap <command>` unless a developer is working directly on internals.
