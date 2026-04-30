export function diffListServers(previousResponse, nextResponse) {
  const previous = structured(previousResponse)?.servers ?? [];
  const next = structured(nextResponse)?.servers ?? [];
  return collectionDiff("list_servers", previous, next, (item) => item.name);
}

export function diffListTools(serverName, previousResponse, nextResponse) {
  const previous = structured(previousResponse)?.tools ?? [];
  const next = structured(nextResponse)?.tools ?? [];
  const diff = collectionDiff("list_tools", previous, next, (item) => item.name);
  return diff ? { ...diff, serverName } : null;
}

export function capabilityChangeError(change) {
  const lines = [
    "The jsmcp daemon reconnected and cached discovery results changed.",
    "Review these changes before retrying execute_code.",
    "",
    ...change.changes.flatMap(formatChange),
  ];
  const error = new Error(lines.join("\n"));
  error.data = change;
  return error;
}

function formatChange(change) {
  if (change.kind === "list_servers") return section("list_servers", change.summary, "server");
  return section(`list_tools(${change.serverName})`, change.summary, "tool");
}

function section(label, summary, itemLabel) {
  const lines = [`${label} changed:`];
  if (summary.added.length) lines.push(`- added ${itemLabel}${summary.added.length === 1 ? "" : "s"}: ${summary.added.join(", ")}`);
  if (summary.removed.length) lines.push(`- removed ${itemLabel}${summary.removed.length === 1 ? "" : "s"}: ${summary.removed.join(", ")}`);
  if (summary.changed.length) lines.push(`- updated ${itemLabel}${summary.changed.length === 1 ? "" : "s"}: ${summary.changed.join(", ")}`);
  return lines;
}

function collectionDiff(kind, previous, next, getKey) {
  const previousMap = new Map(previous.map((item) => [getKey(item), item]));
  const nextMap = new Map(next.map((item) => [getKey(item), item]));
  const added = [];
  const removed = [];
  const changed = [];
  for (const [key, item] of nextMap) {
    if (!previousMap.has(key)) added.push(key);
    else if (JSON.stringify(previousMap.get(key)) !== JSON.stringify(item)) changed.push(key);
  }
  for (const key of previousMap.keys()) if (!nextMap.has(key)) removed.push(key);
  if (!added.length && !removed.length && !changed.length) return null;
  return { kind, summary: { added: added.sort(), removed: removed.sort(), changed: changed.sort() }, before: previous, after: next };
}

function structured(response) {
  return response?.result?.structuredContent;
}
