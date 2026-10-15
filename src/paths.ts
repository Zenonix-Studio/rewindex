import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import * as fs from "fs";

/**
 * Where rewindex keeps its shadow repos and state. Overridable via REWINDEX_HOME
 * (used by the self-check to stay out of the real ~/.rewindex).
 */
export function rewindexHome(): string {
  const override = process.env.REWINDEX_HOME;
  if (override && override.trim()) return path.resolve(override);
  return path.join(os.homedir(), ".rewindex");
}

/**
 * A stable per-project id. We hash the real (symlink-resolved) absolute path so
 * two checkouts at different paths get separate stores and the same path always
 * maps to the same store.
 */
export function projectHash(projectRoot: string): string {
  const real = safeRealpath(projectRoot);
  return crypto.createHash("sha256").update(real).digest("hex").slice(0, 16);
}

function safeRealpath(p: string): string {
  try {
    return fs.realpathSync(path.resolve(p));
  } catch {
    return path.resolve(p);
  }
}

export interface ProjectStore {
  projectRoot: string;
  hash: string;
  /** Root dir for this project's rewindex data. */
  dir: string;
  /** GIT_DIR for the shadow repo. */
  gitDir: string;
  /** Where we remember the last pre-restore safety snapshot, etc. */
  stateFile: string;
}

export function storeFor(projectRoot: string): ProjectStore {
  const root = safeRealpath(projectRoot);
  const hash = projectHash(root);
  const dir = path.join(rewindexHome(), hash);
  return {
    projectRoot: root,
    hash,
    dir,
    gitDir: path.join(dir, "git"),
    stateFile: path.join(dir, "state.json"),
  };
}
