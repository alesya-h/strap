import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { decodeJwt, expandHome, loadChatgptToken } from "#strap/providers/chatgpt-auth";

export async function loadProviderConfig(filePath) {
  const config = JSON.parse(await fs.readFile(expandHome(filePath), "utf8"));
  if (!config.provider) throw new Error("Provider config requires provider");
  if (!config.model) throw new Error("Provider config requires model");
  return normalizeProviderConfig(config, filePath);
}

export function normalizeProviderConfig(config, sourcePath = undefined) {
  const provider = config.provider;
  const api = config.api || defaultApi(provider);
  return {
    ...config,
    sourcePath,
    provider,
    api,
    base_url: config.base_url || defaultBaseUrl(provider, api),
    headers: config.headers || {},
    auth: config.auth || defaultAuth(provider),
  };
}

export async function authHeaders(config) {
  const auth = config.auth || { type: "none" };
  const headers = { ...config.headers };
  if (auth.type === "none") return headers;
  if (auth.type === "api_key" || auth.type === "bearer") {
    const token = await resolveSecret(auth, defaultEnvForProvider(config.provider));
    headers.Authorization = `Bearer ${token}`;
    return headers;
  }
  if (auth.type === "anthropic_api_key") {
    headers["x-api-key"] = await resolveSecret(auth, "ANTHROPIC_API_KEY");
    return headers;
  }
  if (auth.type === "codex_chatgpt") {
    const codex = await loadCodexChatgptAuth(auth);
    headers.Authorization = `Bearer ${codex.accessToken}`;
    if (codex.accountId) headers["ChatGPT-Account-ID"] = codex.accountId;
    if (codex.fedramp) headers["X-OpenAI-Fedramp"] = "true";
    return headers;
  }
  if (auth.type === "chatgpt_oauth") {
    const token = await loadChatgptToken(auth);
    headers.Authorization = `Bearer ${token.access_token}`;
    if (token.account_id) headers["ChatGPT-Account-Id"] = token.account_id;
    return headers;
  }
  throw new Error(`Unknown auth type: ${auth.type}`);
}

export async function refreshProviderAuth(config) {
  if (config.auth?.type === "codex_chatgpt") await loadCodexChatgptAuth({ ...config.auth, force_refresh: true });
  else if (config.auth?.type === "chatgpt_oauth") await loadChatgptToken({ ...config.auth, force_refresh: true });
  else return false;
  return true;
}

async function resolveSecret(auth, defaultEnv) {
  if (auth.value) return auth.value;
  if (auth.env) {
    const value = process.env[auth.env];
    if (!value) throw new Error(`Missing environment variable: ${auth.env}`);
    return value;
  }
  if (auth.file) return (await fs.readFile(expandHome(auth.file), "utf8")).trim();
  if (defaultEnv && process.env[defaultEnv]) return process.env[defaultEnv];
  throw new Error(`No secret configured for auth type ${auth.type}`);
}

async function loadCodexChatgptAuth(auth) {
  const authFile = expandHome(auth.auth_file || path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "auth.json"));
  const doc = JSON.parse(await fs.readFile(authFile, "utf8"));
  if (doc.OPENAI_API_KEY) throw new Error("Codex auth file contains API-key auth, not ChatGPT OAuth auth");
  if (!doc.tokens?.access_token) throw new Error("Codex auth file is missing tokens.access_token");
  if (auth.account_id && auth.account_id !== (doc.tokens.account_id || doc.tokens.id_token?.chatgpt_account_id)) {
    throw new Error(`Codex auth account mismatch: expected ${auth.account_id}`);
  }
  if (auth.force_refresh || shouldRefreshJwt(doc.tokens.access_token, auth.refresh_margin_seconds ?? 120)) {
    if (auth.refresh === false) throw new Error("Codex ChatGPT token is expired/near expiry and refresh=false");
    await refreshCodexToken(authFile, doc, auth.refresh_url);
    return loadCodexChatgptAuth({ ...auth, force_refresh: false });
  }
  const idClaims = decodeJwt(doc.tokens.id_token?.raw_jwt || doc.tokens.id_token || doc.tokens.access_token) || {};
  const authClaims = idClaims["https://api.openai.com/auth"] || {};
  return {
    accessToken: doc.tokens.access_token,
    accountId: doc.tokens.account_id || authClaims.chatgpt_account_id,
    fedramp: Boolean(authClaims.chatgpt_account_is_fedramp),
  };
}

async function refreshCodexToken(authFile, doc, refreshUrl = "https://auth.openai.com/oauth/token") {
  const refreshToken = doc.tokens?.refresh_token;
  if (!refreshToken) throw new Error("Codex auth file is missing tokens.refresh_token");
  const response = await fetch(refreshUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Codex ChatGPT token refresh failed: ${response.status}: ${text}`);
  const refreshed = JSON.parse(text);
  if (refreshed.id_token) doc.tokens.id_token = refreshed.id_token;
  if (refreshed.access_token) doc.tokens.access_token = refreshed.access_token;
  if (refreshed.refresh_token) doc.tokens.refresh_token = refreshed.refresh_token;
  doc.last_refresh = new Date().toISOString();
  await fs.writeFile(authFile, `${JSON.stringify(doc, null, 2)}\n`, { mode: 0o600 });
}

function shouldRefreshJwt(jwt, marginSeconds) {
  const claims = decodeJwt(jwt);
  if (!claims?.exp) return false;
  return claims.exp * 1000 - Date.now() < marginSeconds * 1000;
}

function extractAccountIdFromJwt(jwt) {
  const claims = decodeJwt(jwt) || {};
  const auth = claims["https://api.openai.com/auth"] || {};
  return auth.chatgpt_account_id || claims.organizations?.[0]?.id;
}

function snakeKeys(obj) {
  return Object.fromEntries(Object.entries(obj || {}).map(([key, value]) => [key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`), value]));
}

function defaultApi(provider) {
  if (provider === "anthropic") return "messages";
  if (provider === "openrouter") return "chat";
  return "responses";
}

function defaultBaseUrl(provider, api) {
  if (provider === "chatgpt") return "https://chatgpt.com/backend-api/codex/responses";
  if (provider === "anthropic") return "https://api.anthropic.com/v1/messages";
  if (provider === "openrouter") return "https://openrouter.ai/api/v1/chat/completions";
  if (provider === "openai" && api === "chat") return "https://api.openai.com/v1/chat/completions";
  return "https://api.openai.com/v1/responses";
}

function defaultAuth(provider) {
  if (provider === "chatgpt") return { type: "chatgpt_oauth" };
  if (provider === "anthropic") return { type: "anthropic_api_key", env: "ANTHROPIC_API_KEY" };
  if (provider === "openrouter") return { type: "api_key", env: "OPENROUTER_API_KEY" };
  return { type: "api_key", env: "OPENAI_API_KEY" };
}

function defaultEnvForProvider(provider) {
  if (provider === "openrouter") return "OPENROUTER_API_KEY";
  if (provider === "anthropic") return "ANTHROPIC_API_KEY";
  return "OPENAI_API_KEY";
}
