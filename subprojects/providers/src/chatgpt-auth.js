import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export const CHATGPT_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
export const CHATGPT_ISSUER = "https://auth.openai.com";
export const CHATGPT_DEVICE_URL = `${CHATGPT_ISSUER}/codex/device`;
export const CHATGPT_REDIRECT_URI = "https://auth.openai.com/deviceauth/callback";

export function defaultChatgptTokenFile() {
  return path.join(os.homedir(), ".config", "strap", "auth", "chatgpt.json");
}

export async function loadChatgptToken({ token_file, refresh = true, refresh_margin_seconds = 120, force_refresh = false } = {}) {
  const tokenFile = expandHome(token_file || defaultChatgptTokenFile());
  let token = JSON.parse(await fs.readFile(tokenFile, "utf8"));
  if (force_refresh || shouldRefresh(token, refresh_margin_seconds)) {
    if (refresh === false) throw new Error("ChatGPT token is expired/near expiry and refresh=false");
    token = await refreshChatgptToken({ token, tokenFile });
  }
  if (!token.access_token) throw new Error("ChatGPT token file is missing access_token");
  return normalizeToken(token);
}

export async function saveChatgptToken(token, tokenFile = defaultChatgptTokenFile()) {
  const file = expandHome(tokenFile);
  const next = normalizeToken(token);
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fs.writeFile(file, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return { tokenFile: file, token: next };
}

export async function refreshChatgptToken({ token, tokenFile = defaultChatgptTokenFile(), refresh_url = `${CHATGPT_ISSUER}/oauth/token` }) {
  if (!token.refresh_token) throw new Error("ChatGPT token file is missing refresh_token");
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: token.refresh_token,
    client_id: CHATGPT_CLIENT_ID,
  });
  const response = await fetch(refresh_url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`ChatGPT token refresh failed: ${response.status}: ${text}`);
  const next = normalizeToken({ ...token, ...JSON.parse(text) });
  if (!next.refresh_token) next.refresh_token = token.refresh_token;
  await saveChatgptToken(next, tokenFile);
  return next;
}

export async function loginChatgpt({ token_file, open = true, timeout_seconds = 300, poll_interval_seconds = 5, onUserCode } = {}) {
  const usercode = await postJson(`${CHATGPT_ISSUER}/api/accounts/deviceauth/usercode`, { client_id: CHATGPT_CLIENT_ID });
  const deviceAuthId = usercode.device_auth_id;
  const userCode = usercode.user_code;
  if (!deviceAuthId || !userCode) throw new Error("ChatGPT login response missing device auth fields");
  if (onUserCode) onUserCode({ userCode, url: CHATGPT_DEVICE_URL });
  if (open) openUrl(CHATGPT_DEVICE_URL);
  const exchange = await pollDeviceAuth({ deviceAuthId, userCode, timeout_seconds, poll_interval_seconds });
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code: exchange.authorization_code,
    redirect_uri: CHATGPT_REDIRECT_URI,
    client_id: CHATGPT_CLIENT_ID,
    code_verifier: exchange.code_verifier,
  });
  const response = await fetch(`${CHATGPT_ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`ChatGPT token exchange failed: ${response.status}: ${text}`);
  const saved = await saveChatgptToken(JSON.parse(text), token_file);
  return { tokenFile: saved.tokenFile, accountId: saved.token.account_id, expiresAt: saved.token.expires_at };
}

export async function importCodexChatgptToken({ auth_file, token_file } = {}) {
  const authFile = expandHome(auth_file || path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "auth.json"));
  const doc = JSON.parse(await fs.readFile(authFile, "utf8"));
  if (doc.OPENAI_API_KEY) throw new Error("Codex auth file contains API-key auth, not ChatGPT OAuth auth");
  if (!doc.tokens?.access_token) throw new Error("Codex auth file is missing tokens.access_token");
  const saved = await saveChatgptToken({
    access_token: doc.tokens.access_token,
    refresh_token: doc.tokens.refresh_token,
    id_token: doc.tokens.id_token?.raw_jwt || doc.tokens.id_token,
    account_id: doc.tokens.account_id,
  }, token_file);
  return { tokenFile: saved.tokenFile, accountId: saved.token.account_id, expiresAt: saved.token.expires_at };
}

export function tokenSummary(token) {
  const normalized = normalizeToken(token);
  return { accountId: normalized.account_id, expiresAt: normalized.expires_at };
}

export function expandHome(filePath) {
  if (!filePath?.startsWith("~")) return filePath;
  return path.join(os.homedir(), filePath.slice(1));
}

export function decodeJwt(jwt) {
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

function normalizeToken(token) {
  const next = snakeKeys(token || {});
  next.account_id ||= extractAccountIdFromJwt(next.id_token || next.access_token);
  if (!next.expires_at && next.expires_in) next.expires_at = Math.floor(Date.now() / 1000) + Number(next.expires_in) - 30;
  return next;
}

function shouldRefresh(token, marginSeconds) {
  const expiresAt = token.expires_at || decodeJwt(token.access_token)?.exp;
  if (!expiresAt) return false;
  return expiresAt * 1000 - Date.now() < marginSeconds * 1000;
}

function extractAccountIdFromJwt(jwt) {
  const claims = decodeJwt(jwt) || {};
  const auth = claims["https://api.openai.com/auth"] || {};
  return auth.chatgpt_account_id || claims.organizations?.[0]?.id;
}

async function pollDeviceAuth({ deviceAuthId, userCode, timeout_seconds, poll_interval_seconds }) {
  const deadline = Date.now() + timeout_seconds * 1000;
  while (Date.now() < deadline) {
    const response = await fetch(`${CHATGPT_ISSUER}/api/accounts/deviceauth/token`, {
      method: "POST",
      headers: { "content-type": "application/json", "accept": "application/json", "user-agent": "strap/0.1.0" },
      body: JSON.stringify({ device_auth_id: deviceAuthId, user_code: userCode }),
    });
    const text = await response.text();
    if (response.status === 200) {
      const body = JSON.parse(text);
      if (!body.authorization_code || !body.code_verifier) throw new Error("ChatGPT authorization did not return exchange credentials");
      return body;
    }
    if (![403, 404].includes(response.status)) throw new Error(`ChatGPT authorization failed: ${response.status}: ${text}`);
    await sleep(Math.max(1, poll_interval_seconds) * 1000);
  }
  throw new Error("Timed out waiting for ChatGPT device authorization");
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "accept": "application/json", "user-agent": "strap/0.1.0" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Request failed: ${response.status}: ${text}`);
  return JSON.parse(text);
}

function openUrl(url) {
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(opener, args, { detached: true, stdio: "ignore" });
    child.unref();
  } catch {
    // Printing the URL/code is sufficient for headless use.
  }
}

function snakeKeys(obj) {
  return Object.fromEntries(Object.entries(obj || {}).map(([key, value]) => [key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`), value]));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
