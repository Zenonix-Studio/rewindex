import * as readline from "readline";
import { storeFor } from "./paths";
import { loadConfig } from "./config";
import { ShadowGit } from "./git";
import {
  buildMessage,
  Checkpoint,
  listCheckpoints,
  resolveCheckpoint,
} from "./snapshot";
import { readState, writeState } from "./state";
import { gcStore } from "./gc";

function git(projectRoot: string): ShadowGit {
  return new ShadowGit(storeFor(projectRoot), loadConfig());
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export async function listCommand(projectRoot: string): Promise<number> {
  const g = git(projectRoot);
  const checkpoints = await listCheckpoints(g);
  if (checkpoints.length === 0) {
    console.log("No snapshots yet. Run `rewindex install` and let Codex edit files.");
    return 0;
  }
  // Group by turn so a turn's multiple tool calls read as one unit.
  let lastTurn: string | undefined = "\u0000";
  for (const c of checkpoints) {
    const turn = c.meta.turnId;
    if (turn !== lastTurn) {
      const promptLabel = c.meta.prompt ? ` "${truncate(c.meta.prompt, 60)}"` : "";
      console.log(
        `\nturn ${turn ? turn.slice(0, 8) : "(none)"}${promptLabel}`,
      );
      lastTurn = turn;
    }
    const when = `${relativeTime(c.unixTime)}`;
    const files = `${c.filesChanged} file${c.filesChanged === 1 ? "" : "s"}`;
    console.log(`  ${c.id}  ${when.padEnd(8)}  ${files.padEnd(9)}  ${truncate(c.label, 50)}`);
  }
  return 0;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export async function diffCommand(projectRoot: string, id: string): Promise<number> {
  const g = git(projectRoot);
  const c = await resolveCheckpoint(g, id);
  if (!c) {
    console.error(`No snapshot matching "${id}". Try \`rewindex list\`.`);
    return 1;
  }
  // Diff from the snapshot to the current worktree, limited to files the
  // snapshot knows — i.e. exactly what `restore` would change.
  const files = await g.filesInCommit(c.fullId);
  const r = await g.run(["diff", c.fullId, "--", ...files]);
  if (!r.stdout.trim()) {
    console.log(`Snapshot ${c.id} matches the working tree for its files (nothing to restore).`);
    return 0;
  }
  process.stdout.write(r.stdout);
  return 0;
}

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

export interface RestoreOptions {
  yes?: boolean; // skip confirmation
  undo?: boolean; // restore the pre-restore safety snapshot
}

export async function restoreCommand(
  projectRoot: string,
  id: string | undefined,
  opts: RestoreOptions,
): Promise<number> {
  const store = storeFor(projectRoot);
  const g = new ShadowGit(store, loadConfig());

  let target: Checkpoint | string | null;
  if (opts.undo) {
    const st = readState(store);
    if (!st.lastSafetySnapshot) {
      console.error("Nothing to undo: no restore has run yet in this project.");
      return 1;
    }
    target = st.lastSafetySnapshot;
  } else {
    if (!id) {
      console.error("Usage: rewindex restore <id>   (or --undo)");
      return 1;
    }
    target = await resolveCheckpoint(g, id);
    if (!target) {
      console.error(`No snapshot matching "${id}". Try \`rewindex list\`.`);
      return 1;
    }
  }

  const targetRef = typeof target === "string" ? target : target.fullId;
  const files = await g.filesInCommit(targetRef);
  if (files.length === 0) {
    console.error("That snapshot has no files to restore.");
    return 1;
  }

  // Preview: show which files change, and flag conflicts (files modified since
  // the snapshot — those local edits would be overwritten).
  const changed: string[] = [];
  const conflicts: string[] = [];
  for (const f of files) {
    const r = await g.run(["diff", "--quiet", targetRef, "--", f]);
    if (r.code !== 0) {
      changed.push(f);
      // "conflict" = the working file currently differs from the snapshot AND
      // also differs from the most recent snapshot (an edit rewindex didn't make).
      conflicts.push(f);
    }
  }

  if (changed.length === 0) {
    console.log("Working tree already matches that snapshot. Nothing to do.");
    return 0;
  }

  const label = typeof target === "string" ? "safety snapshot" : target.label;
  console.log(`Restore ${typeof target === "string" ? target.slice(0, 10) : target.id}  "${label}"`);
  console.log(`This will overwrite ${changed.length} file(s) in ${projectRoot}:`);
  for (const f of changed) console.log(`  ~ ${f}`);
  if (conflicts.length > 0) {
    console.log(
      `\n  note: ${conflicts.length} file(s) have local changes since the snapshot; ` +
        `those edits will be replaced. A safety snapshot is taken first — ` +
        `run \`rewindex restore --undo\` to get them back.`,
    );
  }

  if (!opts.yes) {
    const ok = await confirm("\nProceed? [y/N] ");
    if (!ok) {
      console.log("Aborted.");
      return 1;
    }
  }

  // Safety snapshot of the CURRENT state so the restore is reversible.
  const safety = await g.snapshot(
    buildMessage("pre-restore safety snapshot", { event: "pre-restore" }),
  );
  if (safety) {
    writeState(store, {
      lastSafetySnapshot: safety,
      lastRestoredTo: targetRef,
    });
  }

  await g.checkoutPaths(targetRef, changed);
  console.log(`\nRestored ${changed.length} file(s).`);
  if (!opts.undo && safety) {
    console.log(`Undo with: rewindex restore --undo`);
  }
  console.log(
    `Tip: to also rewind the conversation, press Esc-Esc in Codex — rewindex only touches files.`,
  );
  return 0;
}

export async function gcCommand(projectRoot: string): Promise<number> {
  const store = storeFor(projectRoot);
  const config = loadConfig();
  const result = await gcStore(store, config);
  console.log(
    `GC: dropped ${result.dropped} snapshot(s), kept ${result.kept}. ` +
      `Store now ~${(result.bytesAfter / (1024 * 1024)).toFixed(1)} MB.`,
  );
  return 0;
}
