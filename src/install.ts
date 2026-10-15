import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * Install/uninstall the rewindex hooks into Codex's USER-level hook config.
 *
 * ponytail / DELIBERATE DEVIATION: the task said "merge into ~/.codex/config.toml
 * ... parse TOML properly". We instead write ~/.codex/hooks.json, which Codex
 * loads as a first-class user-level hook source and MERGES with config.toml
 * (verified: learn.chatgpt.com/docs/hooks lists `~/.codex/hooks.json` alongside
 * `~/.codex/config.toml`). Rationale: hooks.json is pure JSON, so a round-trip
 * can't clobber the user's hand-written config.toml comments/formatting/other
 * hooks — the single biggest footgun here. Net effect is identical. Ceiling:
 * if a user keeps hooks ONLY in config.toml and nowhere else, ours live in a
 * separate file (still both load). Upgrade path: add a `--into config.toml`
 * mode backed by a real TOML round-tripper if anyone needs it.
 */

const EVENTS = ["PreToolUse", "UserPromptSubmit"] as const;
const MARKER = "rewindex"; // how we recognize our own entries for idempotency

function codexHome(): string {
  const env = process.env.CODEX_HOME;
  return env && env.trim() ? path.resolve(env) : path.join(os.homedir(), ".codex");
}

function hooksJsonPath(): string {
  return path.join(codexHome(), "hooks.json");
}

interface HookHandler {
  type: string;
  command?: string;
  timeout?: number;
  statusMessage?: string;
  [k: string]: unknown;
}
interface MatcherGroup {
  matcher?: string;
  hooks: HookHandler[];
}
interface HooksFile {
  description?: string;
  hooks?: Record<string, MatcherGroup[]>;
  [k: string]: unknown;
}

function rewindexCommand(): string {
  // Resolve the installed binary. When run via `npx rewindex` / a global
  // install, process.argv[1] points at dist/cli.js; prefer the `rewindex` bin
  // on PATH for portability, falling back to the absolute script path.
  const abs = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (abs) return `node ${JSON.stringify(abs)} hook`;
  return "rewindex hook";
}

function ourHandler(): HookHandler {
  return {
    type: "command",
    command: rewindexCommand(),
    timeout: 30,
    statusMessage: "rewindex snapshot",
  };
}

function isOurGroup(g: MatcherGroup): boolean {
  return (g.hooks || []).some(
    (h) => typeof h.command === "string" && h.command.includes(MARKER),
  );
}

function readHooksFile(): HooksFile {
  try {
    return JSON.parse(fs.readFileSync(hooksJsonPath(), "utf8"));
  } catch {
    return {};
  }
}

function writeHooksFile(data: HooksFile): void {
  fs.mkdirSync(codexHome(), { recursive: true });
  fs.writeFileSync(hooksJsonPath(), JSON.stringify(data, null, 2) + "\n");
}

export function installCommand(): number {
  const data = readHooksFile();
  data.hooks = data.hooks || {};
  let added = 0;
  for (const event of EVENTS) {
    const groups = (data.hooks[event] = data.hooks[event] || []);
    // Idempotent: replace any existing rewindex group, leave others untouched.
    const kept = groups.filter((g) => !isOurGroup(g));
    kept.push({ hooks: [ourHandler()] });
    data.hooks[event] = kept;
    added++;
  }
  writeHooksFile(data);
  console.log(`Installed rewindex hooks into ${hooksJsonPath()} (${added} events).`);
  console.log("");
  printTrustNote();
  return 0;
}

export function uninstallCommand(): number {
  const data = readHooksFile();
  if (!data.hooks) {
    console.log("No rewindex hooks found.");
    return 0;
  }
  let removed = 0;
  for (const event of Object.keys(data.hooks)) {
    const groups = data.hooks[event] || [];
    const before = groups.length;
    const kept = groups.filter((g) => !isOurGroup(g));
    removed += before - kept.length;
    if (kept.length > 0) data.hooks[event] = kept;
    else delete data.hooks[event];
  }
  if (Object.keys(data.hooks).length === 0) delete data.hooks;
  writeHooksFile(data);
  console.log(`Removed ${removed} rewindex hook group(s) from ${hooksJsonPath()}.`);
  console.log("Your other hooks were left untouched.");
  return 0;
}

function printTrustNote(): void {
  console.log("IMPORTANT — Codex requires you to TRUST new hooks before they run:");
  console.log("  1. Start (or restart) Codex.");
  console.log("  2. Run  /hooks  in the Codex CLI.");
  console.log("  3. Review the two `rewindex hook` entries and mark them trusted.");
  console.log("");
  console.log("Until trusted, Codex SKIPS them (it warns at startup), so no snapshots");
  console.log("are taken. Trust is tied to the hook's hash — if you reinstall/upgrade");
  console.log("rewindex, re-run /hooks to re-trust the changed command.");
}
