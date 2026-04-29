import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { strapActiveWorkRoot, strapGlobalRoot, strapProjectRoot, strapRepoConfigRoot, strapRoot, strapSessionOverlayRoot, strapWorkRoot, workspaceRoot } from "#strap/core/paths";
import { snapshotCurrentSession } from "#strap/core/session-history";

const LAYERS = ["session", "user", "project", "global", "root"];
const MUTABLE_LAYERS = ["session", "user", "project", "global"];

const TYPES = {
  command: {
    roots: () => ({
      session: maybeJoin(strapSessionOverlayRoot(), "commands"),
      user: path.join(strapWorkRoot(), "commands"),
      project: path.join(strapProjectRoot(), "commands"),
      global: path.join(strapGlobalRoot(), "commands"),
      root: path.join(strapRoot(), "subprojects", "cli", "commands"),
    }),
    discover: discoverCommandArtifacts,
    destination: (root, artifact) => path.join(root, artifact.name),
  },
  tool: {
    roots: () => ({
      session: maybeJoin(strapSessionOverlayRoot(), "tools"),
      user: path.join(strapWorkRoot(), "tools"),
      project: path.join(strapProjectRoot(), "tools"),
      global: path.join(strapGlobalRoot(), "tools"),
      root: path.join(strapRoot(), "tools"),
    }),
    discover: discoverToolArtifacts,
    destination: (root, artifact) => path.join(root, artifact.entryName),
  },
  porcelain: {
    roots: () => ({
      session: maybeJoin(strapSessionOverlayRoot(), "porcelain"),
      user: path.join(strapWorkRoot(), "porcelain"),
      project: path.join(strapProjectRoot(), "porcelain"),
      global: path.join(strapGlobalRoot(), "porcelain"),
      root: path.join(strapRoot(), "porcelain"),
    }),
    discover: discoverPorcelainArtifacts,
    destination: (root, artifact) => path.join(root, artifact.entryName),
  },
  agent: {
    roots: () => ({
      session: maybeJoin(strapSessionOverlayRoot(), "agents"),
      user: path.join(strapWorkRoot(), "agents"),
      project: path.join(strapProjectRoot(), "agents"),
      global: path.join(strapGlobalRoot(), "agents"),
      root: path.join(strapRoot(), "agents"),
    }),
    discover: discoverAgentArtifacts,
    destination: (root, artifact) => path.join(root, artifact.entryName),
  },
  skill: {
    roots: () => ({
      session: maybeJoin(strapSessionOverlayRoot(), "skills"),
      user: path.join(strapWorkRoot(), "skills"),
      project: path.join(strapProjectRoot(), "skills"),
      global: path.join(strapGlobalRoot(), "skills"),
      root: path.join(strapRoot(), "skills"),
    }),
    discover: discoverSkillArtifacts,
    destination: (root, artifact) => path.join(root, artifact.entryName),
  },
  model: {
    roots: () => ({
      session: maybeJoin(strapSessionOverlayRoot(), "models"),
      user: path.join(strapWorkRoot(), "models"),
      project: path.join(strapProjectRoot(), "models"),
      global: path.join(strapGlobalRoot(), "models"),
      root: path.join(strapRepoConfigRoot(), "models"),
    }),
    discover: discoverModelArtifacts,
    destination: (root, artifact) => path.join(root, artifact.entryName),
  },
};

export function artifactTypes() {
  return Object.keys(TYPES);
}

export function artifactRoots() {
  return Object.fromEntries(Object.entries(TYPES).map(([type, config]) => [type, config.roots()]));
}

export function listArtifacts(type, { includePaths = false } = {}) {
  const config = typeConfig(type);
  const all = artifactsByLayer(type);
  const visible = [];
  const seen = new Set();
  for (const layer of LAYERS) {
    for (const artifact of all.filter((item) => item.layer === layer)) {
      if (seen.has(artifact.name)) continue;
      seen.add(artifact.name);
      visible.push(describeArtifact(artifact, all, includePaths));
    }
  }
  return visible.sort((a, b) => a.name.localeCompare(b.name));
}

export function allArtifactStatus({ includePaths = false } = {}) {
  return Object.fromEntries(artifactTypes().map((type) => [type, listArtifacts(type, { includePaths })]));
}

export function workonArtifact(type, name, { includePaths = false } = {}) {
  const config = typeConfig(type);
  const roots = config.roots();
  const all = artifactsByLayer(type);
  const artifact = findVisible(type, name, all);
  const targetLayer = roots.session ? "session" : "user";
  if (artifact.layer === targetLayer) return { ok: true, action: "workon", artifact: describeArtifact(artifact, all, includePaths) };
  const target = config.destination(roots[targetLayer], artifact);
  copyArtifact(artifact, target);
  if (targetLayer === "session") snapshotCurrentSession(`artifact workon: ${type}/${name}`);
  const nextAll = artifactsByLayer(type);
  return { ok: true, action: "workon", artifact: describeArtifact(findLayer(type, artifact.name, targetLayer, nextAll), nextAll, includePaths) };
}

export function promoteArtifact(type, name, { includePaths = false, from, to } = {}) {
  const config = typeConfig(type);
  const roots = config.roots();
  const all = artifactsByLayer(type);
  const sourceLayer = from || firstPromotableLayer(type, name, all);
  const targetLayer = to || nextLayer(sourceLayer);
  if (!targetLayer) throw new Error(`Cannot promote from ${sourceLayer}`);
  if (!roots[targetLayer]) throw new Error(`${targetLayer} layer is not available`);
  const artifact = findLayer(type, name, sourceLayer, all);
  const target = config.destination(roots[targetLayer], artifact);
  copyArtifact(artifact, target);
  removeArtifact(artifact);
  if (sourceLayer === "session" || targetLayer === "session") snapshotCurrentSession(`artifact promote: ${type}/${name} ${sourceLayer}->${targetLayer}`);
  const nextAll = artifactsByLayer(type);
  return { ok: true, action: "promote", from: sourceLayer, to: targetLayer, artifact: describeArtifact(findLayer(type, artifact.name, targetLayer, nextAll), nextAll, includePaths) };
}

export function discardArtifact(type, name, { from } = {}) {
  const all = artifactsByLayer(type);
  const layer = from || firstDiscardableLayer(type, name, all);
  const artifact = findLayer(type, name, layer, all);
  removeArtifact(artifact);
  if (layer === "session") snapshotCurrentSession(`artifact discard: ${type}/${name}`);
  return { ok: true, action: "discard", type, name: artifact.name, from: layer };
}

export function globalStatus({ includePaths = false } = {}) {
  return {
    roots: {
      workspace: workspaceRoot(),
      session: strapSessionOverlayRoot(),
      project: strapProjectRoot(),
      work: strapWorkRoot(),
      active_work: strapActiveWorkRoot(),
      global: strapGlobalRoot(),
      root: strapRoot(),
    },
    layers: LAYERS,
    artifacts: allArtifactStatus({ includePaths }),
  };
}

function typeConfig(type) {
  const config = TYPES[type];
  if (!config) throw new Error(`Unknown artifact type: ${type}. Expected one of: ${artifactTypes().join(", ")}`);
  return config;
}

function artifactsByLayer(type) {
  const config = typeConfig(type);
  const roots = config.roots();
  return LAYERS.flatMap((layer) => roots[layer] ? config.discover(roots[layer], layer) : []);
}

function discoverCommandArtifacts(root, layer) {
  if (!isDirectory(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .filter((dir) => fs.existsSync(path.join(dir, "run")))
    .map((dir) => ({ type: "command", name: path.basename(dir), layer, kind: "directory", entryName: path.basename(dir), root, path: dir, files: filesForDirectory(dir) }));
}

function discoverToolArtifacts(root, layer) {
  if (!isDirectory(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.endsWith(".json"))
    .map((entry) => path.join(root, entry.name))
    .filter((file) => isExecutable(file))
    .map((file) => {
      const sidecars = toolSidecars(file);
      return { type: "tool", name: toolName(file, sidecars), layer, kind: "file", entryName: path.basename(file), root, path: file, files: [file, ...sidecars] };
    });
}

function discoverPorcelainArtifacts(root, layer) {
  if (!isDirectory(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".nu"))
    .map((entry) => path.join(root, entry.name))
    .map((file) => ({ type: "porcelain", name: path.basename(file, ".nu"), layer, kind: "file", entryName: path.basename(file), root, path: file, files: [file] }));
}

function discoverAgentArtifacts(root, layer) {
  if (!isDirectory(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(root, entry.name))
    .map((file) => ({ type: "agent", name: path.basename(file, ".md"), layer, kind: "file", entryName: path.basename(file), root, path: file, files: [file] }));
}

function discoverSkillArtifacts(root, layer) {
  if (!isDirectory(root)) return [];
  return fs.readdirSync(root)
    .filter((name) => fs.existsSync(path.join(root, name, "SKILL.md")))
    .map((name) => path.join(root, name))
    .map((dir) => ({ type: "skill", name: path.basename(dir), layer, kind: "directory", entryName: path.basename(dir), root, path: dir, files: filesForDirectory(dir) }));
}

function discoverModelArtifacts(root, layer) {
  if (!isDirectory(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith(".json"))
    .map((entry) => path.join(root, entry.name))
    .map((file) => ({ type: "model", name: path.basename(file, ".json"), layer, kind: fs.lstatSync(file).isSymbolicLink() ? "symlink" : "file", entryName: path.basename(file), root, path: file, files: [file] }));
}

function describeArtifact(artifact, all, includePaths) {
  const base = all.find((item) => item.name === artifact.name && LAYERS.indexOf(item.layer) > LAYERS.indexOf(artifact.layer));
  const shadows = all.filter((item) => item.name === artifact.name && item.layer !== artifact.layer).map((item) => item.layer);
  const status = ["session", "user"].includes(artifact.layer)
    ? base ? artifactDigest(artifact) === artifactDigest(base) ? "working" : "modified" : "new"
    : artifact.layer;
  return {
    type: artifact.type,
    name: artifact.name,
    layer: artifact.layer,
    status,
    shadows,
    ...(includePaths ? { path: artifact.path, root: artifact.root, files: artifact.files } : {}),
  };
}

function findVisible(type, name, all) {
  const matches = [];
  for (const layer of LAYERS) {
    const found = all.filter((item) => item.layer === layer && item.name === name);
    if (found.length) matches.push(...found);
  }
  if (matches.length === 0) throw new Error(`${type} artifact not found: ${name}`);
  return matches[0];
}

function findLayer(type, name, layer, all) {
  const matches = all.filter((item) => item.layer === layer && item.name === name);
  if (matches.length === 0) throw new Error(`${type} artifact not found in ${layer} layer: ${name}`);
  if (matches.length > 1) throw new Error(`Ambiguous ${type} artifact in ${layer} layer: ${name}`);
  return matches[0];
}

function firstPromotableLayer(type, name, all) {
  for (const layer of MUTABLE_LAYERS) {
    if (all.some((item) => item.layer === layer && item.name === name)) return layer;
  }
  throw new Error(`${type} artifact not found in a promotable layer: ${name}`);
}

function firstDiscardableLayer(type, name, all) {
  for (const layer of ["session", "user"]) {
    if (all.some((item) => item.layer === layer && item.name === name)) return layer;
  }
  throw new Error(`${type} artifact not found in a discardable layer: ${name}`);
}

function nextLayer(layer) {
  const index = LAYERS.indexOf(layer);
  return index === -1 ? undefined : LAYERS[index + 1];
}

function maybeJoin(root, name) {
  return root ? path.join(root, name) : undefined;
}

function copyArtifact(artifact, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (artifact.kind === "directory") {
    fs.rmSync(target, { recursive: true, force: true });
    copyDirectory(artifact.path, target);
    return;
  }
  if (artifact.kind === "symlink") {
    fs.rmSync(target, { force: true });
    fs.symlinkSync(fs.readlinkSync(artifact.path), target);
    return;
  }
  fs.copyFileSync(artifact.path, target);
  fs.chmodSync(target, fs.statSync(artifact.path).mode & 0o777);
  for (const file of artifact.files.filter((file) => file !== artifact.path)) {
    fs.copyFileSync(file, path.join(path.dirname(target), path.basename(file)));
  }
}

function removeArtifact(artifact) {
  if (artifact.kind === "directory") fs.rmSync(artifact.path, { recursive: true, force: true });
  else for (const file of artifact.files) fs.rmSync(file, { force: true });
}

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to);
    else {
      fs.copyFileSync(from, to);
      fs.chmodSync(to, fs.statSync(from).mode & 0o777);
    }
  }
}

function filesForDirectory(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesForDirectory(file);
    return entry.isFile() ? [file] : [];
  }).sort();
}

function artifactDigest(artifact) {
  const hash = crypto.createHash("sha256");
  for (const file of artifact.files) {
    hash.update(path.relative(artifact.path, file));
    hash.update(String(fs.statSync(file).mode & 0o777));
    hash.update(fs.readFileSync(file));
  }
  return hash.digest("hex");
}

function toolSidecars(file) {
  const candidates = [`${file}.json`, file.replace(/\.[^.]+$/, ".json")];
  return [...new Set(candidates)].filter((candidate) => fs.existsSync(candidate));
}

function toolName(file, sidecars) {
  for (const sidecar of sidecars) {
    try {
      const spec = JSON.parse(fs.readFileSync(sidecar, "utf8"));
      if (spec.name) return spec.name;
    } catch {
      // Ignore invalid sidecars here; script tool loading will report schema/runtime errors.
    }
  }
  return path.basename(file).replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]/g, "_");
}

function isDirectory(dir) {
  return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
}

function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}
