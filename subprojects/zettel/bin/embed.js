#!/usr/bin/env node
import process from "node:process";
import { authHeaders, loadProviderConfig } from "#strap/providers/config";

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

function hashEmbedding(text, dimensions) {
  const vector = Array.from({ length: dimensions }, () => 0);
  const terms = String(text).toLowerCase().match(/[\p{L}\p{N}_-]+/gu) || [];
  const features = [];
  for (const term of terms) {
    features.push(term);
    if (term.length > 3) {
      for (let i = 0; i <= term.length - 3; i += 1) features.push(term.slice(i, i + 3));
    }
  }
  for (const feature of features.length ? features : [String(text)]) {
    const hash = hashString(feature);
    const index = hash % dimensions;
    const sign = (hash & 0x80000000) === 0 ? 1 : -1;
    vector[index] += sign;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + (value * value), 0)) || 1;
  return vector.map((value) => Number((value / norm).toFixed(6)));
}

async function openAiEmbeddings(texts) {
  const apiKey = process.env.STRAP_ZK_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("STRAP_ZK_OPENAI_API_KEY or OPENAI_API_KEY is required");
  const model = process.env.STRAP_ZK_EMBED_MODEL || "text-embedding-3-small";
  const body = { model, input: texts };
  const dimensions = process.env.STRAP_ZK_EMBED_DIMENSIONS;
  if (dimensions) body.dimensions = Number(dimensions);
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OpenAI embeddings failed ${response.status}: ${JSON.stringify(payload)}`);
  const embeddings = payload.data.map((item) => item.embedding);
  return {
    model,
    dimensions: embeddings[0]?.length || 0,
    embeddings,
  };
}

async function chatGptEmbeddings(texts) {
  const providerPath = process.env.STRAP_ZK_CHATGPT_PROVIDER || "config/strap/providers/chatgpt-gptel.json";
  const config = await loadProviderConfig(providerPath);
  const headers = await authHeaders(config);
  const model = process.env.STRAP_ZK_EMBED_MODEL || "text-embedding-3-small";
  const body = { model, input: texts };
  const dimensions = process.env.STRAP_ZK_EMBED_DIMENSIONS;
  if (dimensions) body.dimensions = Number(dimensions);
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`ChatGPT embeddings failed ${response.status}: ${JSON.stringify(payload)}`);
  const embeddings = payload.data.map((item) => item.embedding);
  return {
    model,
    dimensions: embeddings[0]?.length || 0,
    embeddings,
  };
}

async function main() {
  const raw = await readStdin();
  const input = raw.trim() ? JSON.parse(raw) : {};
  const texts = Array.isArray(input.texts) ? input.texts.map(String) : [String(input.text || "")];
  const provider = process.env.STRAP_ZK_EMBED_PROVIDER || "chatgpt";
  if (provider === "openai") {
    process.stdout.write(`${JSON.stringify(await openAiEmbeddings(texts))}\n`);
    return;
  }
  if (provider === "chatgpt") {
    process.stdout.write(`${JSON.stringify(await chatGptEmbeddings(texts))}\n`);
    return;
  }
  if (provider !== "hash") throw new Error(`Unsupported STRAP_ZK_EMBED_PROVIDER: ${provider}`);
  const dimensions = Number(process.env.STRAP_ZK_EMBED_DIMENSIONS || 384);
  process.stdout.write(`${JSON.stringify({
    model: `strap-hash-embedding-v1/${dimensions}`,
    dimensions,
    embeddings: texts.map((text) => hashEmbedding(text, dimensions)),
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
