# Provider Configs

`strap llm` can call models from a single provider JSON file. The file is specific to provider + auth + model, so a pipeline only needs `--provider path.json`.

```bash
strap state init \
| strap state add-user "Say hi" \
| strap llm complete --provider config/strap/providers/openai-api-key.json --tools all
```

Checked-in provider configs live in `config/strap/providers/`.

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

- `openai` / `responses` through `https://api.openai.com/v1/responses` with API-key auth
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

### ChatGPT/Codex backend OAuth/subscription

```json
{
  "type": "chatgpt_oauth",
  "token_file": "~/.config/strap/auth/chatgpt.json",
  "refresh": true
}
```

This reads `strap`'s ChatGPT OAuth token cache:

- `access_token`
- `refresh_token`
- `account_id`
- `expires_at`

Create or update the token with:

```bash
strap auth chatgpt login
strap auth chatgpt refresh
strap auth chatgpt show
```

As a temporary migration path from an existing Codex login, import the Codex ChatGPT OAuth token into the `strap` cache:

```bash
strap auth chatgpt import-codex
```

If the access token is near expiry, `strap` refreshes it using OpenAI's OAuth refresh endpoint and writes the updated token file back with mode `0600`. This is an auth-store mutation, not a session-state mutation.

ChatGPT OAuth is a separate auth family from normal OpenAI API-key auth. Do not use ChatGPT OAuth credentials with `https://api.openai.com/v1/responses`; that public endpoint expects API-token/project-key credentials. Use ChatGPT OAuth only with ChatGPT/Codex backend endpoints such as `https://chatgpt.com/backend-api/codex/responses`.

Request headers include:

- `Authorization: Bearer <access_token>`
- `ChatGPT-Account-ID: <account_id>` when available

Provider config:

```json
{
  "provider": "chatgpt",
  "api": "responses",
  "model": "gpt-5.5",
  "base_url": "https://chatgpt.com/backend-api/codex/responses",
  "auth": {
    "type": "chatgpt_oauth",
    "token_file": "~/.config/strap/auth/chatgpt.json",
    "refresh": true
  },
  "stream": true,
  "parameters": {
    "store": false,
    "stream": true
  }
}
```

For an end-to-end agent loop with native tool calls/results:

```bash
strap state init \
| strap state add-user "Analyze this repo" \
| strap loop --provider config/strap/providers/chatgpt.json --tools all --max-turns 6 \
| tee session.json \
| strap state display-last-message
```

`strap loop` repeatedly calls the model, executes pending tool calls, and feeds results back as provider-native `function_call_output` items. If the tool budget is exhausted, it asks for a final no-tools answer using gathered context.

## Commands

Provider-generic commands:

```bash
strap llm compile --provider provider.json < state.json
strap llm call --provider provider.json < state.json
strap llm complete --provider provider.json < state.json
```

OpenAI convenience commands:

```bash
strap llm compile-openai --model gpt-5.1 < state.json
strap llm complete-openai --model gpt-5.1 < state.json
```
