# Provider Configs

`strap-llm` can call models from a single provider JSON file. The file is meant to be specific to provider + auth + model, so a pipeline only needs `--provider path.json`.

```bash
node bin/strap-state.js init \
| node bin/strap-state.js add-user "Say hi" \
| node bin/strap-llm.js complete --provider providers/openai.json --tools all
```

Examples live in `providers.example/`.

## Common Shape

```json
{
  "name": "openai-gpt-5.1-api-key",
  "provider": "openai",
  "api": "responses",
  "model": "gpt-5.1",
  "auth": {
    "type": "api_key",
    "env": "OPENAI_API_KEY"
  },
  "base_url": "https://api.openai.com/v1/responses",
  "headers": {},
  "parameters": {}
}
```

Supported `provider` / `api` combinations now:

- `openai` / `responses`
- `openai` / `chat`
- `chatgpt` / `responses` via ChatGPT Codex endpoint
- `openrouter` / `chat`
- `anthropic` / `messages`

## Auth Modes

### API key / bearer

```json
{"type": "api_key", "env": "OPENAI_API_KEY"}
```

The secret can come from `env`, `file`, or `value`.

### Anthropic API key

```json
{"type": "anthropic_api_key", "env": "ANTHROPIC_API_KEY"}
```

This sends `x-api-key` instead of `Authorization: Bearer`.

### OpenAI via Codex ChatGPT OAuth/subscription

```json
{
  "type": "codex_chatgpt",
  "auth_file": "~/.codex/auth.json",
  "refresh": true,
  "account_id": "optional-workspace-id"
}
```

This reads Codex-style `auth.json` token data:

- `tokens.access_token`
- `tokens.refresh_token`
- `tokens.account_id`

If the access token is near expiry, `strap` refreshes it using OpenAI's OAuth refresh endpoint and Codex's client id, then writes the updated auth file back with mode `0600`. This mirrors the relevant Codex behavior. It is an auth-store mutation, not a session-state mutation.

Request headers include:

- `Authorization: Bearer <access_token>`
- `ChatGPT-Account-ID: <account_id>` when available
- `X-OpenAI-Fedramp: true` when the token claims require it

### OpenAI via gptel ChatGPT OAuth/subscription

The local gptel fork uses a different working path for ChatGPT subscription access:

```json
{
  "provider": "chatgpt",
  "api": "responses",
  "model": "gpt-5.5",
  "base_url": "https://chatgpt.com/backend-api/codex/responses",
  "auth": {
    "type": "gptel_chatgpt",
    "token_file": "~/.emacs.d/.cache/gptel/chatgpt-token",
    "refresh": true,
    "originator": "gptel"
  },
  "stream": true,
  "parameters": {
    "store": false,
    "stream": true
  }
}
```

This reads gptel's Emacs-lisp plist token cache, refreshes through `https://auth.openai.com/oauth/token`, and calls `chatgpt.com/backend-api/codex/responses`. This is the currently tested subscription/OAuth route.

For an end-to-end agent loop with native tool calls/results:

```bash
node bin/strap-state.js init \
| node bin/strap-state.js add-user "Analyze this repo" \
| node bin/strap-loop.js --provider providers.example/chatgpt-gptel.json --tools all --max-turns 6 \
| tee session.json \
| node bin/strap-state.js display-last-message
```

`strap-loop` repeatedly calls the model, executes pending tool calls, and feeds results back as provider-native `function_call_output` items. If the tool budget is exhausted, it asks for a final no-tools answer using gathered context.

## Commands

Provider-generic commands:

```bash
strap-llm compile --provider provider.json < state.json
strap-llm call --provider provider.json < state.json
strap-llm complete --provider provider.json < state.json
```

Legacy aliases still exist for OpenAI:

```bash
strap-llm compile-openai --model gpt-5.1 < state.json
strap-llm complete-openai --model gpt-5.1 < state.json
```
