# Daily Use

A minimal project-local workflow:

```bash
strap work init
strap session new "repo analysis"
strap session ask "Analyze this repo"
strap session recall "repo architecture"
strap session show \
| strap loop-nu --provider config/strap/providers/chatgpt.json --tools all --max-turns 6 \
| tee session.json \
| strap session save
```

Store useful conclusions in the shared memory:

```bash
strap session remember session,summary
```

Inspect the work area:

```bash
strap work path
strap session list
strap session trace
strap zk list
strap zk tags
```

Add project-local commands:

```bash
strap commands new repo-check
strap edit repo-check
strap commands list --json
strap commands validate --json
```

Use the Babashka data-layer prototype:

```bash
strap state-bb init
strap state-bb init | strap state-bb add-user "hello"
```
