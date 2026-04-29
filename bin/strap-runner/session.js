import fs from "node:fs";
import path from "node:path";
import { strapWorkRoot } from "./env.js";

export function resolveSession(value, die) {
  const direct = path.resolve(value);
  if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) return direct;

  const sessions = path.join(strapWorkRoot(), "sessions");
  const candidate = path.join(sessions, value);
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;

  const matches = fs.existsSync(sessions)
    ? fs.readdirSync(sessions, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.includes(value))
      .map((entry) => path.join(sessions, entry.name))
    : [];

  if (matches.length === 1) return matches[0];
  if (matches.length > 1) die(`Ambiguous session: ${value}`);
  die(`Session not found: ${value}`);
}
