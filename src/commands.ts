import * as readline from "readline";
import { storeFor } from "./paths";
import { loadConfig } from "./config";
import { ShadowGit } from "./git";
import {
  buildMessage,
  Checkpoint,
  listPromptCheckpoints,
  PromptCheckpoint,
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
  if (s < 60) return `${s} sn önce`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} sa önce`;
  return `${Math.round(h / 24)} gün önce`;
}

export async function listCommand(projectRoot: string): Promise<number> {
  const g = git(projectRoot);
  const checkpoints = await listPromptCheckpoints(g);
  if (checkpoints.length === 0) {
    console.log("Henüz geri alınabilecek bir prompt değişikliği yok.");
    return 0;
  }
  console.log("Son 50 değişiklik\n");
  for (const [index, checkpoint] of checkpoints.entries()) {
    const title = truncate(checkpoint.meta.prompt || checkpoint.label, 48);
    const line = `${index + 1}. ${checkpoint.id} · ${checkpoint.filesChanged} dosya · ${title}`;
    console.log(`${line.padEnd(78)} ${relativeTime(checkpoint.unixTime)}`);
    console.log(`   Özet: ${summary(checkpoint)}`);
    if (index + 1 < checkpoints.length) console.log("");
  }
  return 0;
}

function summary(checkpoint: PromptCheckpoint): string {
  const removed = checkpoint.changes.filter((change) => change.status === "A").length;
  const recreated = checkpoint.changes.filter((change) => change.status === "D").length;
  const restored = checkpoint.changes.length - removed - recreated;
  const parts: string[] = [];
  if (removed) parts.push(`${removed} dosya silinir`);
  if (restored) parts.push(`${restored} dosya geri alınır`);
  if (recreated) parts.push(`${recreated} dosya yeniden oluşturulur`);
  return `${parts.join(", ")}.`;
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
  const r = await g.run(["diff", c.fullId, "--"]);
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
  const changes = await g.changesSince(targetRef);
  const changed = changes.map((change) => change.path);

  if (changed.length === 0) {
    console.log("Working tree already matches that snapshot. Nothing to do.");
    return 0;
  }

  const label = typeof target === "string" ? "safety snapshot" : target.label;
  console.log(`Restore ${typeof target === "string" ? target.slice(0, 10) : target.id}  "${label}"`);
  console.log(`This will change ${changed.length} file(s) in ${projectRoot}:`);
  for (const f of changed) console.log(`  ~ ${f}`);
  if (changed.length > 0) {
    console.log(
      `\n  note: ${changed.length} file(s) differ from the snapshot; ` +
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
  const safety = (await g.snapshot(
    buildMessage("pre-restore safety snapshot", { event: "pre-restore" }),
  )) ?? await g.revParse("HEAD");
  writeState(store, {
    lastSafetySnapshot: safety,
    lastRestoredTo: targetRef,
  });

  await g.deletePaths(
    changes.filter((change) => change.status === "A").map((change) => change.path),
  );
  await g.checkoutPaths(
    targetRef,
    changes.filter((change) => change.status !== "A").map((change) => change.path),
  );
  console.log(`\nRestored ${changed.length} file(s).`);
  if (!opts.undo) {
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
