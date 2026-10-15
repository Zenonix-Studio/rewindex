import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { ProjectStore } from "./paths";
import { RewindexConfig } from "./config";

export interface GitResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Thin wrapper over the system `git`, run against an ISOLATED shadow repo:
 *  - GIT_DIR points at our per-project store, GIT_WORK_TREE at the project root,
 *    so the project's own .git is never read or written.
 *  - GIT_CONFIG_GLOBAL/SYSTEM are forced to /dev/null so the user's git config,
 *    hooks, and signing settings can't leak in or fire.
 *  - identity is fixed, LANG=C for stable parsing, and mutating commands pass
 *    --no-verify so no hooks run.
 *
 * ponytail: ~130-line hand wrapper instead of simple-git. Ceiling: covers the
 * handful of plumbing commands we need. Upgrade path: if the command surface
 * grows past ~a dozen calls, swap in a real git library.
 */
export class ShadowGit {
  constructor(
    private readonly store: ProjectStore,
    private readonly config: RewindexConfig,
  ) {}

  get gitDir(): string {
    return this.store.gitDir;
  }

  private env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
    return {
      ...process.env,
      GIT_DIR: this.store.gitDir,
      GIT_WORK_TREE: this.store.projectRoot,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
      GIT_AUTHOR_NAME: "rewindex",
      GIT_AUTHOR_EMAIL: "rewindex@localhost",
      GIT_COMMITTER_NAME: "rewindex",
      GIT_COMMITTER_EMAIL: "rewindex@localhost",
      GIT_OPTIONAL_LOCKS: "0",
      LANG: "C",
      LC_ALL: "C",
      ...extra,
    };
  }

  /**
   * Env for `git init`: identical to {@link env} but WITHOUT GIT_WORK_TREE.
   * git refuses `init` when a worktree is set without an explicit --git-dir arg,
   * so we create the repo first, then every later command uses the worktree env.
   */
  private initEnv(): NodeJS.ProcessEnv {
    const e = this.env();
    delete (e as Record<string, unknown>).GIT_WORK_TREE;
    return e;
  }

  run(args: string[], extraEnv: Record<string, string> = {}): Promise<GitResult> {
    return new Promise((resolve, reject) => {
      execFile(
        "git",
        args,
        { env: this.env(extraEnv), maxBuffer: 256 * 1024 * 1024 },
        (err, stdout, stderr) => {
          const code = err && typeof (err as any).code === "number" ? (err as any).code : err ? 1 : 0;
          if (err && code === 0) {
            reject(err);
            return;
          }
          resolve({ stdout: stdout ?? "", stderr: stderr ?? "", code });
        },
      );
    });
  }

  /** Run and throw on non-zero exit. */
  async runOk(args: string[], extraEnv: Record<string, string> = {}): Promise<string> {
    const r = await this.run(args, extraEnv);
    if (r.code !== 0) {
      throw new Error(`git ${args.join(" ")} failed (${r.code}): ${r.stderr.trim()}`);
    }
    return r.stdout;
  }

  async isInitialized(): Promise<boolean> {
    try {
      await fs.promises.access(path.join(this.store.gitDir, "HEAD"));
      return true;
    } catch {
      return false;
    }
  }

  /** Create the shadow repo and an empty root commit if it doesn't exist yet. */
  async ensureInit(): Promise<void> {
    if (await this.isInitialized()) return;
    await fs.promises.mkdir(this.store.dir, { recursive: true });
    // Init into GIT_DIR WITHOUT a worktree set (git forbids init when a worktree
    // is set but no --git-dir arg is given). Every later command uses the full
    // env with GIT_WORK_TREE so snapshots read/write the project files.
    await new Promise<void>((resolve, reject) => {
      execFile(
        "git",
        ["init", "--quiet", "--initial-branch=rewindex"],
        { env: this.initEnv() },
        (err, _o, stderr) => (err ? reject(new Error(`git init failed: ${stderr}`)) : resolve()),
      );
    });
    await this.runOk(["config", "core.bare", "false"]);
    await this.runOk(["config", "core.logAllRefUpdates", "true"]);
    // Root commit so the first real snapshot always has a parent to diff against.
    await this.runOk([
      "commit",
      "--allow-empty",
      "--no-verify",
      "-m",
      "rewindex root\n\nrewindex-event: root",
    ]);
  }

  /**
   * Build the pathspec that excludes configured dirs and (separately computed)
   * oversized files. We force-add so gitignored project files ARE captured.
   */
  private excludePathspecs(extraExcludes: string[]): string[] {
    const specs: string[] = ["."];
    const all = [...this.config.exclude, ...extraExcludes];
    for (const e of all) {
      // :(exclude) pathspec magic; works for both dirs and files.
      specs.push(`:(exclude)${e}`);
      specs.push(`:(exclude)**/${e}`);
    }
    return specs;
  }

  /**
   * Walk the worktree to find files over the size cap so we can exclude them.
   * ponytail: full synchronous walk per snapshot. Ceiling: fine for normal
   * projects once node_modules is excluded. Upgrade path: cache stat results or
   * lean on `git ls-files -z` + stat only the candidates.
   */
  private findOversized(): string[] {
    const over: string[] = [];
    const cap = this.config.maxFileBytes;
    const skip = new Set(this.config.exclude);
    const root = this.store.projectRoot;
    const walk = (dir: string, rel: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        if (skip.has(ent.name)) continue;
        const abs = path.join(dir, ent.name);
        const relPath = rel ? `${rel}/${ent.name}` : ent.name;
        if (ent.isDirectory()) {
          walk(abs, relPath);
        } else if (ent.isFile()) {
          try {
            if (fs.statSync(abs).size > cap) over.push(relPath);
          } catch {
            /* ignore unreadable */
          }
        }
      }
    };
    walk(root, "");
    return over;
  }

  /**
   * Stage the current worktree (honoring excludes + size cap, force-adding so
   * gitignored files are included) and commit. Returns the new commit sha, or
   * null if nothing changed since the last snapshot.
   */
  async snapshot(message: string, authorDateISO?: string): Promise<string | null> {
    await this.ensureInit();
    const oversized = this.config.captureIgnored ? this.findOversized() : [];
    // Clear the index first so deletions are captured too.
    await this.runOk(["read-tree", "--empty"]);
    const addArgs = ["add", "-A"];
    if (this.config.captureIgnored) addArgs.push("-f");
    addArgs.push("--", ...this.excludePathspecs(oversized));
    const addRes = await this.run(addArgs);
    if (addRes.code !== 0) {
      throw new Error(`git add failed: ${addRes.stderr.trim()}`);
    }
    // Did anything actually change vs HEAD?
    const diff = await this.run(["diff", "--cached", "--quiet", "HEAD"]);
    if (diff.code === 0) {
      return null; // no change
    }
    const extraEnv: Record<string, string> = {};
    if (authorDateISO) {
      extraEnv.GIT_AUTHOR_DATE = authorDateISO;
      extraEnv.GIT_COMMITTER_DATE = authorDateISO;
    }
    await this.runOk(["commit", "--no-verify", "--allow-empty", "-m", message], extraEnv);
    return (await this.runOk(["rev-parse", "HEAD"])).trim();
  }

  async revParse(ref: string): Promise<string> {
    return (await this.runOk(["rev-parse", ref])).trim();
  }

  async filesInCommit(ref: string): Promise<string[]> {
    const out = await this.runOk(["ls-tree", "-r", "--name-only", ref]);
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  }

  /** Restore the given paths from a commit into the worktree. */
  async checkoutPaths(ref: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    await this.runOk(["checkout", ref, "--", ...paths]);
  }

  /** Content of a file at a commit, or null if it didn't exist then. */
  async fileAt(ref: string, file: string): Promise<Buffer | null> {
    const r = await this.run(["show", `${ref}:${file}`]);
    if (r.code !== 0) return null;
    return Buffer.from(r.stdout, "binary");
  }
}
