import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { strapSessionRoot } from "#strap/core/paths";

export function snapshotCurrentSession(message) {
  const dir = strapSessionRoot();
  if (!dir) return false;
  ensureHistory(dir);
  runJj(dir, ["describe", "-m", message], { capture: true });
  runJj(dir, ["new"], { capture: true });
  return true;
}

function ensureHistory(dir) {
  ensureIgnore(dir);
  if (!fs.existsSync(path.join(dir, ".jj"))) runJj(dir, ["git", "init", "--no-colocate", "."], { capture: true });
}

function ensureIgnore(dir) {
  const file = path.join(dir, ".gitignore");
  const wanted = ["/provider-requests/tmp/", "/tool-results/tmp/", ""].join("\n");
  if (!fs.existsSync(file)) fs.writeFileSync(file, wanted);
}

function runJj(dir, jjArgs, opts = {}) {
  const child = spawnSync("jj", jjArgs, { cwd: dir, stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "inherit", encoding: "utf8" });
  if (child.error?.code === "ENOENT") throw new Error("jj is required for strap session history");
  if (child.status !== 0) throw new Error(opts.capture ? (child.stderr || child.stdout) : `jj exited ${child.status}`);
  return child.stdout;
}
