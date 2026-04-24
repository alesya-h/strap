export function textContent(text) {
  return [{ type: "text", text: String(text ?? "") }];
}

export function jsonContent(value) {
  return textContent(JSON.stringify(value, null, 2));
}

export function toolResult(output, metadata = {}) {
  if (typeof output === "string") return { content: textContent(output), metadata };
  return { content: jsonContent(output), metadata };
}

export function truncateText(text, limit = 40000) {
  const value = String(text ?? "");
  if (value.length <= limit) return { text: value, truncated: false };
  return {
    text: `${value.slice(0, limit)}\n\n[truncated ${value.length - limit} bytes]`,
    truncated: true,
  };
}
