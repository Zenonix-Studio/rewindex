import { GitChange, ShadowGit } from "./git";

/**
 * Snapshot metadata is encoded as trailers in the commit message so the git
 * history is self-describing (no sidecar DB to corrupt). First line is a short
 * human label; a blank line; then `rewindex-<key>: <value>` trailers.
 */
export interface SnapshotMeta {
  turnId?: string;
  sessionId?: string;
  event?: string; // PreToolUse | UserPromptSubmit | manual | pre-restore | root
  tool?: string;
  prompt?: string; // prompt snippet (for UserPromptSubmit / labels)
}

export interface Checkpoint {
  id: string; // short sha
  fullId: string;
  dateISO: string;
  unixTime: number;
  label: string;
  meta: SnapshotMeta;
  filesChanged: number;
}

export interface PromptCheckpoint extends Checkpoint {
  changes: GitChange[];
}

const TRAILER_KEYS: Record<string, keyof SnapshotMeta> = {
  "rewindex-turn": "turnId",
  "rewindex-session": "sessionId",
  "rewindex-event": "event",
  "rewindex-tool": "tool",
  "rewindex-prompt": "prompt",
};

export function buildMessage(label: string, meta: SnapshotMeta): string {
  const lines = [sanitizeLabel(label), ""];
  const push = (k: string, v?: string) => {
    if (v) lines.push(`${k}: ${oneLine(v)}`);
  };
  push("rewindex-turn", meta.turnId);
  push("rewindex-session", meta.sessionId);
  push("rewindex-event", meta.event);
  push("rewindex-tool", meta.tool);
  push("rewindex-prompt", meta.prompt);
  return lines.join("\n");
}

function sanitizeLabel(s: string): string {
  return oneLine(s).slice(0, 120) || "rewindex snapshot";
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function parseMeta(body: string): { label: string; meta: SnapshotMeta } {
  const lines = body.split("\n");
  const label = lines[0] ?? "";
  const meta: SnapshotMeta = {};
  for (const line of lines.slice(1)) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    const field = TRAILER_KEYS[key];
    if (field) meta[field] = val;
  }
  return { label, meta };
}

/**
 * List snapshots newest-first, skipping the empty root commit. `filesChanged`
 * is the count vs the immediate parent.
 */
export async function listCheckpoints(git: ShadowGit): Promise<Checkpoint[]> {
  if (!(await git.isInitialized())) return [];
  const SEP = "\x1e";
  const REC = "\x1f";
  const fmt = `%H${SEP}%ct${SEP}%B${REC}`;
  const out = (await git.run(["log", `--pretty=format:${fmt}`])).stdout;
  const records = out.split(REC).map((r) => r.trim()).filter(Boolean);
  const checkpoints: Checkpoint[] = [];
  for (const rec of records) {
    const [fullId, ct, body = ""] = rec.split(SEP);
    const { label, meta } = parseMeta(body.trim());
    if (meta.event === "root") continue;
    const unixTime = Number(ct) * 1000;
    const filesChanged = await countFilesChanged(git, fullId);
    checkpoints.push({
      id: fullId.slice(0, 10),
      fullId,
      dateISO: new Date(unixTime).toISOString(),
      unixTime,
      label,
      meta,
      filesChanged,
    });
  }
  return checkpoints;
}

export async function listPromptCheckpoints(
  git: ShadowGit,
  limit = 50,
): Promise<PromptCheckpoint[]> {
  const checkpoints = await listCheckpoints(git);
  const prompts: PromptCheckpoint[] = [];
  for (const checkpoint of checkpoints) {
    const prompt = checkpoint.meta.prompt?.trim();
    if (checkpoint.meta.event !== "UserPromptSubmit" || !prompt || prompt.startsWith("$rewindex")) {
      continue;
    }
    const changes = await git.changesSince(checkpoint.fullId);
    if (changes.length === 0) continue;
    prompts.push({ ...checkpoint, filesChanged: changes.length, changes });
    if (prompts.length === limit) break;
  }
  return prompts;
}

async function countFilesChanged(git: ShadowGit, fullId: string): Promise<number> {
  const r = await git.run(["diff", "--name-only", `${fullId}~1`, fullId]);
  if (r.code !== 0) return 0;
  return r.stdout.split("\n").filter((s) => s.trim()).length;
}

/** Resolve a user-supplied id (short sha or "latest") to a full sha. */
export async function resolveCheckpoint(
  git: ShadowGit,
  id: string,
): Promise<Checkpoint | null> {
  const all = await listCheckpoints(git);
  if (all.length === 0) return null;
  const numbered = /^\d+$/.test(id) ? Number(id) : 0;
  if (numbered >= 1 && numbered <= 50) {
    return (await listPromptCheckpoints(git))[numbered - 1] ?? null;
  }
  if (id === "latest" || id === "last") {
    return (await listPromptCheckpoints(git))[0] ?? null;
  }
  const matches = all.filter((c) => c.fullId.startsWith(id) || c.id === id);
  return matches[0] ?? null;
}
