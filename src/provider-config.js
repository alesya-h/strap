import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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
  if (auth.type === "gptel_chatgpt") {
    const token = await loadGptelChatgptAuth(auth);
    headers.Authorization = `Bearer ${token.accessToken}`;
    headers.originator ||= auth.originator || "gptel";
    if (token.accountId) headers["ChatGPT-Account-Id"] = token.accountId;
    return headers;
  }
  throw new Error(`Unknown auth type: ${auth.type}`);
}

export async function refreshProviderAuth(config) {
  if (config.auth?.type === "codex_chatgpt") await loadCodexChatgptAuth({ ...config.auth, force_refresh: true });
  else if (config.auth?.type === "gptel_chatgpt") await loadGptelChatgptAuth({ ...config.auth, force_refresh: true });
  else return false;
  return true;
}

async function loadGptelChatgptAuth(auth) {
  const tokenFile = expandHome(auth.token_file || path.join(os.homedir(), ".emacs.d/.cache/gptel/chatgpt-token"));
  let token = parseEmacsPlist(await fs.readFile(tokenFile, "utf8"));
  if (auth.force_refresh || Number(token.expires_at || 0) <= Date.now() / 1000 + (auth.refresh_margin_seconds ?? 30)) {
    if (auth.refresh === false) throw new Error("gptel ChatGPT token is expired/near expiry and refresh=false");
    token = await refreshGptelToken(tokenFile, token, auth.refresh_url);
  }
  if (!token.access_token) throw new Error("gptel token file is missing :access_token");
  return { accessToken: token.access_token, accountId: token.account_id || extractAccountIdFromJwt(token.id_token || token.access_token) };
}

async function refreshGptelToken(tokenFile, token, refreshUrl = "https://auth.openai.com/oauth/token") {
  if (!token.refresh_token) throw new Error("gptel token file is missing :refresh_token");
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: token.refresh_token,
    client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
  });
  const response = await fetch(refreshUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`gptel ChatGPT token refresh failed: ${response.status}: ${text}`);
  const next = { ...token, ...snakeKeys(JSON.parse(text)) };
  if (!next.refresh_token) next.refresh_token = token.refresh_token;
  next.account_id = next.account_id || extractAccountIdFromJwt(next.id_token || next.access_token) || token.account_id;
  next.expires_at = Math.floor(Date.now() / 1000) + Number(next.expires_in || 3600) - 30;
  await fs.writeFile(tokenFile, emacsPlist(next), { mode: 0o600 });
  return next;
}

async function resolveSecret(auth, fallbackEnv) {
  if (auth.value) return auth.value;
  if (auth.env) {
    const value = process.env[auth.env];
    if (!value) throw new Error(`Missing environment variable: ${auth.env}`);
    return value;
  }
  if (auth.file) return (await fs.readFile(expandHome(auth.file), "utf8")).trim();
  if (fallbackEnv && process.env[fallbackEnv]) return process.env[fallbackEnv];
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

function decodeJwt(jwt) {
  if (typeof jwt !== "string") return undefined;
  const parts = jwt.split(".");
  if (parts.length < 2) return undefined;
  try {
    const payload = parts[1].replaceAll("-", "+").replaceAll("_", "/");
    return JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
  } catch {
    return undefined;
  }
}

function extractAccountIdFromJwt(jwt) {
  const claims = decodeJwt(jwt) || {};
  const auth = claims["https://api.openai.com/auth"] || {};
  return auth.chatgpt_account_id || claims.organizations?.[0]?.id;
}

function parseEmacsPlist(text) {
  const result = {};
  const re = /:([A-Za-z0-9_-]+)\s+("(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|t|nil)/g;
  let match;
  while ((match = re.exec(text))) {
    const key = match[1].replaceAll("-", "_");
    const raw = match[2];
    if (raw.startsWith('"')) result[key] = raw.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    else if (raw === "t") result[key] = true;
    else if (raw === "nil") result[key] = undefined;
    else result[key] = Number(raw);
  }
  return result;
}

function emacsPlist(obj) {
  const keys = ["access_token", "refresh_token", "id_token", "expires_in", "account_id", "expires_at"];
  const parts = [];
  for (const key of keys) {
    if (obj[key] === undefined || obj[key] === null) continue;
    parts.push(`:${key.replaceAll("_", "-")}`);
    if (typeof obj[key] === "number") parts.push(String(obj[key]));
    else parts.push(`"${String(obj[key]).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  }
  return `(${parts.join(" ")})\n`;
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
  if (provider === "chatgpt") return { type: "gptel_chatgpt" };
  if (provider === "anthropic") return { type: "anthropic_api_key", env: "ANTHROPIC_API_KEY" };
  if (provider === "openrouter") return { type: "api_key", env: "OPENROUTER_API_KEY" };
  return { type: "api_key", env: "OPENAI_API_KEY" };
}

function defaultEnvForProvider(provider) {
  if (provider === "openrouter") return "OPENROUTER_API_KEY";
  if (provider === "anthropic") return "ANTHROPIC_API_KEY";
  return "OPENAI_API_KEY";
}

export function expandHome(filePath) {
  if (!filePath?.startsWith("~")) return filePath;
  return path.join(os.homedir(), filePath.slice(1));
}
