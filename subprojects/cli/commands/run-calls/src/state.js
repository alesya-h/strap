import fs from "node:fs/promises";

export async function readJsonInput(file = "-") {
  const text = file === "-" ? await readStdin() : await fs.readFile(file, "utf8");
  return JSON.parse(text || "null");
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

export function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function normalizeState(input) {
  if (input?.root?.type === "scope") return input;
  throw new Error("Expected strap.state.v0.2 state with root scope");
}

export function flattenVisible(node, output = []) {
  if (!node) return output;
  if (node.type === "event") {
    output.push(node);
    return output;
  }
  if (node.type !== "scope") return output;
  if (node.status === "collapsed") {
    output.push({ type: "event", from: "harness", to: node.participants || [], kind: "summary", text: node.summary || `[collapsed scope: ${node.label}]` });
    return output;
  }
  for (const child of node.children || []) flattenVisible(child, output);
  return output;
}

export function appendEvent(state, event) {
  state.root.children.push({ type: "event", ...event });
  return state;
}

export async function readState(file) {
  return normalizeState(JSON.parse(await fs.readFile(file, "utf8")));
}

export async function writeState(file, state) {
  await fs.writeFile(file, `${JSON.stringify(normalizeState(state), null, 2)}\n`);
}

export function createState() {
  return { version: "strap.state.v0.2", actors: {}, root: { type: "scope", label: "root", status: "open", participants: [], children: [] } };
}

export function collapseLastOpenScope(state, summary) {
  const scope = [...state.root.children].reverse().find((node) => node.type === "scope" && node.status === "open");
  if (!scope) throw new Error("No open scope found");
  scope.status = "collapsed";
  scope.summary = summary;
  scope.hidden = { children: scope.children };
  scope.children = [];
  return state;
}
