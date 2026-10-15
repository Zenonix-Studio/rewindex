import * as fs from "fs";
import * as path from "path";
import { rewindexHome } from "./paths";

/** User-tunable knobs. Defaults match SPEC v1. */
export interface RewindexConfig {
  /** Directory names / globs never captured. */
  exclude: string[];
  /** Per-file size cap in bytes; larger files are skipped. */
  maxFileBytes: number;
  /** GC retention: drop snapshots older than this many days. */
  retentionDays: number;
  /** GC retention: keep total store under this many bytes. */
  retentionBytes: number;
  /**
   * When false, gitignored files are NOT captured. Default true (capture them),
   * which is the whole point — but see the secrets caveat in the README.
   */
  captureIgnored: boolean;
}

export const DEFAULT_CONFIG: RewindexConfig = {
  exclude: [
    ".git",
    "node_modules",
    ".rewindex",
    ".DS_Store",
    // common heavy build/output dirs
    "dist",
    "build",
    ".next",
    ".venv",
    "target",
    "__pycache__",
  ],
  maxFileBytes: 16 * 1024 * 1024,
  retentionDays: 7,
  retentionBytes: 500 * 1024 * 1024,
  captureIgnored: true,
};

/**
 * Config is read from ~/.rewindex/config.json if present, else defaults.
 * ponytail: single global config file, no per-project override and no schema
 * validation. Ceiling: fine for v1 (one user, one machine). Upgrade path: layer
 * a project-local .rewindex.json and validate with a tiny schema check.
 */
export function loadConfig(): RewindexConfig {
  const file = path.join(rewindexHome(), "config.json");
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return { ...DEFAULT_CONFIG, ...raw };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
