import { execSync } from "child_process";
import { ProjectStore } from "./paths";
import { RewindexConfig } from "./config";
import { ShadowGit } from "./git";

export interface GcResult {
  dropped: number;
  kept: number;
  bytesAfter: number;
}

interface RawCommit {
  sha: string;
  tree: string;
  time: number; // unix seconds
  message: string;
  isRoot: boolean;
}

/**
 * Retention GC. Snapshots live as a commit chain on the `rewindex` branch; to
 * drop old ones we REBUILD the chain from the survivors' trees with `commit-tree`
 * (preserving each message + author date), then expire reflogs and `git gc` so
 * the dropped objects are actually reclaimed.
 *
 * ponytail: O(n) history rewrite on every gc run. Ceiling: fine at hundreds of
 * snapshots. Upgrade path: a generational/packfile strategy, or only rewrite
 * when the drop count crosses a threshold.
 */
export async function gcStore(
  store: ProjectStore,
  config: RewindexConfig,
): Promise<GcResult> {
  const git = new ShadowGit(store, config);
  if (!(await git.isInitialized())) {
    return { dropped: 0, kept: 0, bytesAfter: 0 };
  }

  const commits = await readCommits(git);
  if (commits.length === 0) {
    return { dropped: 0, kept: 0, bytesAfter: dirBytes(store.gitDir) };
  }

  const cutoffSec = Date.now() / 1000 - config.retentionDays * 86400;
  // Keep the empty root (anchor) plus any snapshot newer than the cutoff.
  // Oldest -> newest order for rebuilding.
  const chronological = [...commits].reverse();
  const survivors = chronological.filter((c) => c.isRoot || c.time >= cutoffSec);

  // Size cap: if still over budget, drop oldest snapshots (never the root) until
  // under budget or only the root + newest remain.
  let bytes = dirBytes(store.gitDir);
  if (bytes > config.retentionBytes) {
    // survivors is oldest->newest; peel from the front (after the root).
    const root = survivors.filter((c) => c.isRoot);
    let snaps = survivors.filter((c) => !c.isRoot);
    while (bytes > config.retentionBytes && snaps.length > 1) {
      snaps = snaps.slice(1);
      // Rough proportional estimate; real bytes recomputed after rewrite.
      bytes = bytes * (snaps.length / (snaps.length + 1));
    }
    survivors.length = 0;
    survivors.push(...root, ...snaps);
  }

  const droppedCount = commits.length - survivors.length;
  if (droppedCount === 0) {
    return { dropped: 0, kept: commits.length, bytesAfter: dirBytes(store.gitDir) };
  }

  // Rebuild the chain from survivor trees.
  let parent: string | null = null;
  for (const c of survivors) {
    const args = ["commit-tree", c.tree];
    if (parent) args.push("-p", parent);
    args.push("-m", c.message);
    const env: Record<string, string> = {
      GIT_AUTHOR_DATE: `${c.time} +0000`,
      GIT_COMMITTER_DATE: `${c.time} +0000`,
    };
    parent = (await git.runOk(args, env)).trim();
  }
  if (parent) {
    await git.runOk(["update-ref", "refs/heads/rewindex", parent]);
  }

  // Reclaim space.
  await git.run(["reflog", "expire", "--all", "--expire=now"]);
  await git.run(["gc", "--prune=now", "--quiet"]);

  return {
    dropped: droppedCount,
    kept: survivors.length,
    bytesAfter: dirBytes(store.gitDir),
  };
}

async function readCommits(git: ShadowGit): Promise<RawCommit[]> {
  const SEP = "\x1e";
  const REC = "\x1f";
  const fmt = `%H${SEP}%T${SEP}%ct${SEP}%B${REC}`;
  const out = (await git.run(["log", `--pretty=format:${fmt}`])).stdout;
  const records = out.split(REC).map((r) => r.trim()).filter(Boolean);
  // newest-first (git log default)
  return records.map((rec) => {
    const [sha, tree, ct, message = ""] = rec.split(SEP);
    const isRoot = /rewindex-event: root/.test(message);
    return { sha, tree, time: Number(ct), message: message.trim(), isRoot };
  });
}

/** Disk usage of the shadow git dir in bytes (best-effort). */
function dirBytes(dir: string): number {
  try {
    const out = execSync(`du -sk "${dir}"`, { encoding: "utf8" });
    const kb = parseInt(out.trim().split(/\s+/)[0], 10);
    return kb * 1024;
  } catch {
    return 0;
  }
}
