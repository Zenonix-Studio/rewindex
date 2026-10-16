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

const OUTPUT_WIDTH = 88;

export async function listCommand(projectRoot: string): Promise<number> {
  const g = git(projectRoot);
  const checkpoints = await listPromptCheckpoints(g);
  if (checkpoints.length === 0) {
    console.log("Henüz geri alınabilecek bir prompt değişikliği yok.");
    return 0;
  }
  console.log("Son 50 değişiklik\n");
  for (const [index, checkpoint] of checkpoints.entries()) {
    const groups = changeGroups(checkpoint);
    console.log(alignRight(`${index + 1}. ${checkpoint.id}`, relativeTime(checkpoint.unixTime)));
    console.log(alignRight(
      "",
      `${groups.changed.length} değişen · ${groups.added.length} eklenen · ${groups.deleted.length} silinen`,
    ));
    printWrapped("   Prompt: ", checkpoint.meta.prompt || checkpoint.label, 2);
    printWrapped("   Özet: ", summary(groups));
    if (index + 1 < checkpoints.length) console.log("");
  }
  return 0;
}

function changeGroups(checkpoint: PromptCheckpoint) {
  return {
    added: checkpoint.changes.filter((change) => change.status === "A").map((change) => change.path),
    deleted: checkpoint.changes.filter((change) => change.status === "D").map((change) => change.path),
    changed: checkpoint.changes.filter((change) => !["A", "D"].includes(change.status)).map((change) => change.path),
  };
}

function summary(groups: ReturnType<typeof changeGroups>): string {
  const parts: string[] = [];
  if (groups.changed.length) parts.push(`${pathList(groups.changed)} önceki haline döner`);
  if (groups.added.length) parts.push(`${pathList(groups.added)} kaldırılır`);
  if (groups.deleted.length) parts.push(`${pathList(groups.deleted)} yeniden oluşturulur`);
  return `${parts.join("; ")}.`;
}

function pathList(paths: string[]): string {
  const shown = paths.slice(0, 3);
  const names = shown.length === 1
    ? shown[0]
    : `${shown.slice(0, -1).join(", ")} ve ${shown.at(-1)}`;
  return paths.length > shown.length ? `${names} ve ${paths.length - shown.length} dosya daha` : names;
}

function alignRight(left: string, right: string): string {
  return `${left}${" ".repeat(Math.max(1, OUTPUT_WIDTH - left.length - right.length))}${right}`;
}

function printWrapped(prefix: string, text: string, maxLines = Number.POSITIVE_INFINITY): void {
  const lines = wrap(text, OUTPUT_WIDTH - prefix.length, maxLines);
  for (const [index, line] of lines.entries()) {
    console.log(`${index === 0 ? prefix : " ".repeat(prefix.length)}${line}`);
  }
}

function wrap(text: string, width: number, maxLines: number): string[] {
  let remaining = text.replace(/\s+/g, " ").trim();
  const lines: string[] = [];
  while (remaining && lines.length < maxLines) {
    if (remaining.length <= width) {
      lines.push(remaining);
      remaining = "";
      break;
    }
    const space = remaining.lastIndexOf(" ", width);
    const cut = space > 0 ? space : width;
    lines.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) lines[lines.length - 1] = `${lines.at(-1)!.slice(0, width - 1)}…`;
  return lines;
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
  await g.snapshot(buildMessage("before rewindex restore", { event: "manual" }));

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
