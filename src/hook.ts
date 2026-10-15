import { storeFor } from "./paths";
import { loadConfig } from "./config";
import { ShadowGit } from "./git";
import { buildMessage, SnapshotMeta } from "./snapshot";

/**
 * Shape of the hook payload Codex sends on stdin. Field set verified against
 * codex-cli 0.147.0 (binary strings + learn.chatgpt.com/docs/hooks).
 */
interface HookPayload {
  session_id?: string;
  turn_id?: string;
  cwd?: string;
  hook_event_name?: string; // PreToolUse | UserPromptSubmit | ...
  model?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_use_id?: string;
  prompt?: string;
  permission_mode?: string;
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (d) => (data += d));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
    // If nothing is piped, don't hang forever.
    setTimeout(() => resolve(data), 2000).unref();
  });
}

function labelFor(p: HookPayload): { label: string; meta: SnapshotMeta } {
  const event = p.hook_event_name || "unknown";
  const meta: SnapshotMeta = {
    turnId: p.turn_id,
    sessionId: p.session_id,
    event,
    tool: p.tool_name,
    prompt: p.prompt,
  };
  let label: string;
  if (event === "UserPromptSubmit" && p.prompt) {
    label = p.prompt;
  } else if (event === "PreToolUse") {
    label = `before ${p.tool_name || "tool"}`;
  } else {
    label = `${event} snapshot`;
  }
  return { label, meta };
}

/**
 * The `rewindex hook` entrypoint. Reads one JSON payload, takes a SYNCHRONOUS
 * snapshot, then exits 0. It must NEVER block the tool call: any failure is
 * logged to stderr and we still exit 0 (stdout stays empty, which Codex ignores
 * for PreToolUse so the tool proceeds unchanged).
 */
export async function hookCommand(): Promise<number> {
  const raw = await readStdin();
  let payload: HookPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    // Can't parse — nothing to snapshot against, but never block the tool.
    process.stderr.write("rewindex: unparseable hook payload, skipping snapshot\n");
    return 0;
  }

  const projectRoot = payload.cwd || process.cwd();
  try {
    const store = storeFor(projectRoot);
    const config = loadConfig();
    const git = new ShadowGit(store, config);
    const { label, meta } = labelFor(payload);
    const sha = await git.snapshot(buildMessage(label, meta));
    if (sha) {
      process.stderr.write(`rewindex: snapshot ${sha.slice(0, 10)} (${meta.event})\n`);
    }
  } catch (err) {
    // Log and warn only — the snapshot failing must not stop Codex.
    process.stderr.write(`rewindex: snapshot failed (non-blocking): ${(err as Error).message}\n`);
  }
  return 0;
}
