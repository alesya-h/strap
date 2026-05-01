# User Work Templates

`user/template/.strap` and `user/template/.strap-user` show the intended project-local harness layout.

For a real project, copy or initialize this shape at:

```text
my-project/.strap/
my-project/.strap-user/
```

The harness treats `.strap` as `STRAP_PROJECT`: promoted project commands, tools, config, and shared memory live there.

The harness treats `.strap-user` as `STRAP_WORK`: user/agent-local sessions, history, temporary commands/tools, logs, cache, and private memory live there.
