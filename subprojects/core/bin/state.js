#!/usr/bin/env node
import { appendEvent, collapseLastOpenScope, compileChatMessages, compileOpenAIResponses, createState, flattenVisible, normalizeState, openScope } from "#strap/core/state";
import { readJsonInput, takeOption, writeJson } from "#strap/core/cli-io";
import crypto from "node:crypto";

const [command, ...args] = process.argv.slice(2);

function usage() {
  console.error("Usage: strap state <init|add-user|add-assistant|push|pop|bookmark|extract|fold|locate|show|tree|compile-chat|compile-openai|display-last-message> [args] < state.json > next.json");
  process.exit(2);
}

if (!command) usage();

async function inputState() {
  return normalizeState(await readJsonInput(takeOption(args, "--file", "-")));
}

switch (command) {
  case "init":
    writeJson(createState());
    break;
  case "add-user": {
    const state = await inputState();
    appendEvent(state, { from: "user", to: ["assistant"], kind: "message", text: args.join(" ") });
    writeJson(state);
    break;
  }
  case "add-assistant": {
    const state = await inputState();
    appendEvent(state, { from: "assistant", to: ["user"], kind: "message", text: args.join(" ") });
    writeJson(state);
    break;
  }
  case "push": {
    const state = await inputState();
    openScope(state, args.join(" ") || "scope");
    writeJson(state);
    break;
  }
  case "pop": {
    const state = await inputState();
    collapseLastOpenScope(state, args.join(" "));
    writeJson(state);
    break;
  }
  case "bookmark": {
    await bookmarkCommand();
    break;
  }
  case "extract": {
    const state = await inputState();
    const from = takeOption(args, "--from");
    const to = takeOption(args, "--to", from);
    if (!from || !to) throw new Error("Usage: strap state extract --from <bookmark> [--to <bookmark>]");
    writeJson(extractBookmarkedRange(state, { from, to }));
    break;
  }
  case "fold": {
    const state = await inputState();
    const from = takeOption(args, "--from");
    const to = takeOption(args, "--to");
    const summary = takeOption(args, "--summary", args.join(" "));
    const label = takeOption(args, "--label", "folded conversation segment");
    if (!from || !to || !summary) throw new Error("Usage: strap state fold --from <bookmark> --to <bookmark> --summary <text>");
    foldBookmarkedRange(state, { from, to, summary, label });
    writeJson(state);
    break;
  }
  case "locate": {
    const state = await inputState();
    const text = takeOption(args, "--text", args.join(" "));
    if (!text) throw new Error("Usage: strap state locate --text <unique substring>");
    writeJson(describeMatch(locateUniqueByText(state, text, { includeHidden: true })));
    break;
  }
  case "show": {
    const state = await inputState();
    const selector = takeOption(args, "--bookmark", args[0]);
    const text = takeOption(args, "--text");
    if (text) writeJson(locateUniqueByText(state, text, { includeHidden: true }).node);
    else if (selector) writeJson(locateUniqueBookmark(state, selector, { includeHidden: true }).node);
    else throw new Error("Usage: strap state show <bookmark> | --text <unique substring>");
    break;
  }
  case "tree": {
    const state = await inputState();
    const hidden = takeFlag(args, "--hidden");
    process.stdout.write(renderTree(state, { includeHidden: hidden }));
    break;
  }
  case "compile-chat":
    writeJson(compileChatMessages(await inputState()));
    break;
  case "compile-openai": {
    const modelIndex = args.indexOf("--model");
    const model = modelIndex === -1 ? "gpt-5.1" : args[modelIndex + 1];
    writeJson(compileOpenAIResponses(await inputState(), { model }));
    break;
  }
  case "display-last-message": {
    const state = await inputState();
    const events = state.root.children.filter((node) => node.type === "event");
    const last = [...events].reverse().find((event) => event.from === "assistant" && event.text);
    process.stdout.write(last?.text ? `${last.text}\n` : "");
    break;
  }
  default:
    usage();
}

async function bookmarkCommand() {
  const subcommand = args.shift();
  if (subcommand === "add") {
    const state = await inputState();
    const text = takeOption(args, "--text", args.join(" "));
    const label = takeOption(args, "--label", "");
    const createdBy = takeOption(args, "--created-by", "assistant");
    const id = takeOption(args, "--id", newBookmarkId());
    if (!text) throw new Error("Usage: strap state bookmark add --text <unique substring> [--label label]");
    const match = locateUniqueByText(state, text, { includeHidden: false });
    addBookmark(match.node, { id, label, created_by: createdBy, created_at: new Date().toISOString() });
    process.stderr.write(`bookmark ${id} added at ${match.path}\n`);
    writeJson(state);
  } else if (subcommand === "list") {
    const state = await inputState();
    writeJson(listBookmarks(state, { includeHidden: takeFlag(args, "--hidden") }));
  } else if (subcommand === "remove") {
    const state = await inputState();
    const id = args[0] || takeOption(args, "--id");
    if (!id) throw new Error("Usage: strap state bookmark remove <bookmark>");
    removeBookmark(state, id);
    writeJson(state);
  } else {
    throw new Error("Usage: strap state bookmark <add|list|remove> [args]");
  }
}

function newBookmarkId() {
  return `bm_${Math.floor(Date.now() / 1000).toString(36)}_${crypto.randomBytes(2).toString("hex")}`;
}

function takeFlag(values, name) {
  const index = values.indexOf(name);
  if (index === -1) return false;
  values.splice(index, 1);
  return true;
}

function addBookmark(node, bookmark) {
  node.bookmarks ||= [];
  if (node.bookmarks.some((item) => bookmarkId(item) === bookmark.id)) throw new Error(`Bookmark already present: ${bookmark.id}`);
  node.bookmarks.push(Object.fromEntries(Object.entries(bookmark).filter(([, value]) => value !== "" && value !== undefined)));
}

function removeBookmark(state, id) {
  let removed = 0;
  for (const match of walkState(state, { includeHidden: true })) {
    if (!Array.isArray(match.node.bookmarks)) continue;
    const next = match.node.bookmarks.filter((item) => bookmarkId(item) !== id);
    removed += match.node.bookmarks.length - next.length;
    if (next.length) match.node.bookmarks = next;
    else delete match.node.bookmarks;
  }
  if (removed === 0) throw new Error(`Bookmark not found: ${id}`);
}

function foldBookmarkedRange(state, { from, to, summary, label }) {
  const start = locateUniqueBookmark(state, from, { includeHidden: true });
  const end = locateUniqueBookmark(state, to, { includeHidden: true });
  if (start.hidden || end.hidden) throw new Error("Cannot fold bookmarks inside a collapsed scope. Unfold or target visible bookmarks first.");
  if (start.parent !== end.parent || start.key !== end.key) throw new Error("Bookmarks must resolve to siblings in the same visible scope");
  const first = Math.min(start.index, end.index);
  const last = Math.max(start.index, end.index);
  const siblings = start.parent[start.key];
  const children = siblings.slice(first, last + 1);
  const scope = {
    type: "scope",
    label,
    status: "collapsed",
    participants: [...new Set(children.flatMap(nodeParticipants).filter(Boolean))],
    summary,
    children: [],
    hidden: { children },
  };
  siblings.splice(first, children.length, scope);
}

function extractBookmarkedRange(state, { from, to }) {
  const start = locateUniqueBookmark(state, from, { includeHidden: true });
  const end = locateUniqueBookmark(state, to, { includeHidden: true });
  if (start.hidden || end.hidden) throw new Error("Cannot extract bookmarks inside a collapsed scope. Unfold or target visible bookmarks first.");
  if (start.parent !== end.parent || start.key !== end.key) throw new Error("Bookmarks must resolve to siblings in the same visible scope");
  const first = Math.min(start.index, end.index);
  const last = Math.max(start.index, end.index);
  const children = start.parent[start.key].slice(first, last + 1).map((node) => JSON.parse(JSON.stringify(node)));
  const scope = { type: "scope", label: "extracted context", status: "open", participants: [...new Set(children.flatMap(nodeParticipants).filter(Boolean))], children };
  return {
    version: "strap.context.v0.1",
    source: {
      state_version: state.version,
      from,
      to,
      path_from: start.path,
      path_to: end.path,
    },
    nodes: children,
    events: flattenVisible(scope),
  };
}

function nodeParticipants(node) {
  return [node.from, ...(Array.isArray(node.to) ? node.to : node.to ? [node.to] : []), ...(node.participants || [])];
}

function locateUniqueByText(state, text, { includeHidden }) {
  const matches = walkState(state, { includeHidden }).filter((match) => nodeSearchText(match.node).includes(text));
  if (matches.length === 0) throw new Error(`No unique text match found: ${text}`);
  if (matches.length > 1) throw new Error(`Ambiguous text match (${matches.length} matches): ${text}`);
  return matches[0];
}

function locateUniqueBookmark(state, id, { includeHidden }) {
  const matches = walkState(state, { includeHidden }).filter((match) => bookmarkIds(match.node).includes(id));
  if (matches.length === 0) throw new Error(`Bookmark not found: ${id}`);
  if (matches.length > 1) throw new Error(`Duplicate bookmark found: ${id}`);
  return matches[0];
}

function listBookmarks(state, { includeHidden }) {
  return walkState(state, { includeHidden }).flatMap((match) => (match.node.bookmarks || []).map((bookmark) => ({
    ...bookmarkObject(bookmark),
    path: match.path,
    hidden: match.hidden,
    node: describeNode(match.node),
  })));
}

function describeMatch(match) {
  return { path: match.path, hidden: match.hidden, node: describeNode(match.node), bookmarks: (match.node.bookmarks || []).map(bookmarkObject) };
}

function describeNode(node) {
  return {
    type: node.type,
    kind: node.kind,
    from: node.from,
    to: node.to,
    label: node.label,
    status: node.status,
    excerpt: nodeSearchText(node).slice(0, 160),
  };
}

function bookmarkIds(node) {
  return (node.bookmarks || []).map(bookmarkId).filter(Boolean);
}

function bookmarkId(bookmark) {
  return typeof bookmark === "string" ? bookmark : bookmark?.id;
}

function bookmarkObject(bookmark) {
  return typeof bookmark === "string" ? { id: bookmark } : bookmark;
}

function nodeSearchText(node) {
  return [node.text, node.summary, node.label].filter(Boolean).join("\n");
}

function walkState(state, { includeHidden = false } = {}) {
  const output = [];
  walkChildren(state.root, "root", "children", includeHidden, output, false);
  return output;
}

function walkChildren(parent, parentPath, key, includeHidden, output, hidden) {
  for (const [index, node] of (parent[key] || []).entries()) {
    const path = `${parentPath}.${key}[${index}]`;
    output.push({ node, parent, key, index, path, hidden });
    if (node.type === "scope") {
      walkChildren(node, path, "children", includeHidden, output, hidden);
      if (includeHidden && node.hidden?.children) walkChildren(node.hidden, `${path}.hidden`, "children", includeHidden, output, true);
    }
  }
}

function renderTree(state, { includeHidden }) {
  const lines = ["root"];
  renderChildren(state.root.children || [], "  ", lines, includeHidden);
  return `${lines.join("\n")}\n`;
}

function renderChildren(children, indent, lines, includeHidden) {
  for (const node of children) {
    const marks = bookmarkIds(node).map((id) => ` @${id}`).join("");
    if (node.type === "event") lines.push(`${indent}- event ${node.from || "?"} -> ${(node.to || ["all"]).join(",")}; ${node.kind || "message"}${marks}: ${nodeSearchText(node).slice(0, 80)}`);
    else lines.push(`${indent}- scope ${node.label || "scope"} [${node.status || "open"}]${marks}: ${(node.summary || "").slice(0, 80)}`);
    if (node.type === "scope" && node.status !== "collapsed") renderChildren(node.children || [], `${indent}  `, lines, includeHidden);
    if (includeHidden && node.hidden?.children) {
      lines.push(`${indent}  hidden:`);
      renderChildren(node.hidden.children, `${indent}    `, lines, includeHidden);
    }
  }
}
