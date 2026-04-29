export function toolResult(output, metadata = {}) {
  const text = typeof output === "string" ? output : JSON.stringify(output, null, 2);
  return { content: [{ type: "text", text: String(text ?? "") }], metadata };
}

export function truncateText(text, limit = 40000) {
  const value = String(text ?? "");
  if (value.length <= limit) return { text: value, truncated: false };
  return { text: `${value.slice(0, limit)}\n\n[truncated ${value.length - limit} bytes]`, truncated: true };
}
