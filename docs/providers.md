# Model Profiles

`strap llm`, `strap loop`, `strap one-shot`, and `strap context summarize` use model profiles. A profile is the model plus its provider street address: provider adapter, API family, endpoint, auth, headers, and default parameters.

Runtime commands default to `--model current`, so this is enough:

```bash
strap state init \
| strap state add-user "Say hi" \
| strap llm complete --tools all
```

Checked-in model profiles live in the root layer's `models/` directory. `current.json` selects the default profile.

Inspect and select models with:

```bash
strap model list
strap model show current
strap model use gpt-5.5-chatgpt
strap model fork current gpt-5.6-chatgpt --set-model-id gpt-5.6
```

## Common Shape

```json
{
  "name": "gpt-5.1-openai",
  "provider": "openai",
  "api": "responses",
  "model_id": "gpt-5.1",
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
- `openrouter` / `embeddings`
- `anthropic` / `messages`

## Provider Command Layout

`strap provider` is a public dispatcher, not a provider implementation. It routes to hidden provider commands that own their implementation details:

| Hidden command | Runtime | Role |
| --- | --- | --- |
| `provider-openai` | Nushell | OpenAI REST calls and embeddings. |
| `provider-openrouter` | Nushell | OpenRouter chat-completions REST calls and embeddings. |
| `provider-anthropic` | Nushell | Anthropic Messages REST calls. |
| `provider-chatgpt` | Babashka | ChatGPT/Codex backend calls and OAuth token management. |

The rule is: REST-only providers should be small Nu capsules. Use a provider-local Node package only when that provider needs SDKs or other package dependencies. Do not add a shared provider runner; shared provider code recreates the coupling this command split is meant to remove.

`strap embed` is the provider-neutral facade. It implements deterministic local `hash` embeddings itself and delegates provider-backed embeddings to `strap provider <name> embed`.

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
strap provider chatgpt auth login
strap provider chatgpt auth refresh
strap provider chatgpt auth show
```

As a temporary migration path from an existing Codex login, import the Codex ChatGPT OAuth token into the `strap` cache:

```bash
strap provider chatgpt auth import-codex
```

If the access token is near expiry, `strap` refreshes it using OpenAI's OAuth refresh endpoint and writes the updated token file back with mode `0600`. This is an auth-store mutation, not a session-state mutation.

ChatGPT OAuth is a separate auth family from normal OpenAI API-key auth. Do not use ChatGPT OAuth credentials with public OpenAI API endpoints such as `https://api.openai.com/v1/responses` or `/v1/embeddings`; those endpoints expect API-token/project-key credentials. Use ChatGPT OAuth only with ChatGPT/Codex backend endpoints such as `https://chatgpt.com/backend-api/codex/responses`.

Request headers include:

- `Authorization: Bearer <access_token>`
- `ChatGPT-Account-ID: <account_id>` when available

Model profile:

```json
{
  "provider": "chatgpt",
  "api": "responses",
  "model_id": "gpt-5.5",
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
| strap loop --tools all --max-turns 6 \
| tee session.json \
| strap state display-last-message
```

`strap loop` repeatedly calls the model, executes pending tool calls, and feeds results back as provider-native `function_call_output` items. If the tool budget is exhausted, it asks for a final no-tools answer using gathered context.

## Commands

Model-profile commands:

```bash
strap llm compile --model current < state.json
strap llm call --model gpt-5.5-chatgpt < state.json
strap llm complete --model models/gpt-5.1-openai.json < state.json
```

Provider-specific commands are available when you want to target the adapter explicitly:

```bash
strap provider list
strap provider chatgpt compile --model current < state.json
strap provider openai compile --model gpt-5.1-openai < state.json
strap provider anthropic complete --model claude-sonnet-4.5-anthropic < state.json
printf '{"texts":["semantic recall"]}' | strap provider openai embed --model text-embedding-3-small
printf '{"texts":["semantic recall"]}' | strap provider openrouter embed
```

`strap llm` loads the model profile and dispatches through the matching provider command. `strap provider <name> ...` dispatches to hidden `provider-<name>` implementation commands; `strap embed` is the provider-neutral embedding facade.
