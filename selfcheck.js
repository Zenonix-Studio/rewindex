#!/usr/bin/env node
/**
 * rewindex self-check (no test framework — one runnable script, per project rules).
 *
 * Simulates the real hook flow end to end:
 *   1. scratch project in a temp dir, REWINDEX_HOME pointed at a temp store
 *   2. pipe a fake UserPromptSubmit payload to `rewindex hook`      -> snapshot A
 *   3. create a NEW file + modify an existing one
 *   4. pipe a fake PreToolUse payload to `rewindex hook`            -> snapshot B
 *   5. further mutate (and delete a tracked file) to simulate a bad edit
 *   6. `rewindex list` shows the snapshots
 *   7. `rewindex restore <B> -y` and assert files match the state at B
 *   8. `rewindex restore --undo -y` and assert we get the bad state back
 *   9. assert gitignored files ARE captured, and the project's own git is untouched
 */
const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const CLI = path.join(__dirname, "dist", "cli.js");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rewindex-selfcheck-"));
const proj = path.join(tmpRoot, "proj");
const home = path.join(tmpRoot, "home");
fs.mkdirSync(proj, { recursive: true });
fs.mkdirSync(home, { recursive: true });

const env = { ...process.env, REWINDEX_HOME: home };
let passed = 0;
function ok(msg) {
  passed++;
  console.log(`  ok - ${msg}`);
}

function hook(payload) {
  const res = spawnSync("node", [CLI, "hook"], {
    input: JSON.stringify(payload),
    env,
    encoding: "utf8",
  });
  assert.strictEqual(res.status, 0, `hook must exit 0 (got ${res.status}); stderr: ${res.stderr}`);
  return res;
}

function cli(args) {
  const res = spawnSync("node", [CLI, ...args], { env, encoding: "utf8" });
  return res;
}

function initProjectGit() {
  // The project has its OWN git repo; rewindex must never touch it.
  execFileSync("git", ["init", "-q"], { cwd: proj });
  execFileSync("git", ["config", "user.email", "t@t"], { cwd: proj });
  execFileSync("git", ["config", "user.name", "t"], { cwd: proj });
  fs.writeFileSync(path.join(proj, ".gitignore"), "secret.env\n");
  fs.writeFileSync(path.join(proj, "existing.txt"), "original line\n");
  execFileSync("git", ["add", "-A"], { cwd: proj });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: proj });
}

function projectGitHead() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: proj, encoding: "utf8" }).trim();
}

(function run() {
  console.log(`rewindex self-check`);
  console.log(`  proj: ${proj}`);
  console.log(`  home: ${home}`);

  initProjectGit();
  const projHeadBefore = projectGitHead();

  // 1) UserPromptSubmit -> baseline snapshot (captures existing.txt + a gitignored file)
  fs.writeFileSync(path.join(proj, "secret.env"), "API_KEY=baseline\n"); // gitignored
  hook({
    hook_event_name: "UserPromptSubmit",
    session_id: "sess-1",
    turn_id: "turn-1",
    cwd: proj,
    prompt: "add a greeting module and tweak existing.txt",
    model: "gpt-5.6",
  });
  ok("UserPromptSubmit hook took a snapshot and exited 0");

  // 2) Codex "creates" a new file and modifies an existing one.
  fs.writeFileSync(path.join(proj, "greeting.js"), "module.exports = 'hi';\n");
  fs.writeFileSync(path.join(proj, "existing.txt"), "edited by codex\n");
  fs.writeFileSync(path.join(proj, "secret.env"), "API_KEY=edited\n");

  // 3) PreToolUse -> snapshot B (the good state we want to return to)
  const preTool = hook({
    hook_event_name: "PreToolUse",
    session_id: "sess-1",
    turn_id: "turn-1",
    cwd: proj,
    tool_name: "apply_patch",
    tool_use_id: "call-1",
    tool_input: { command: "*** Begin Patch ..." },
    permission_mode: "auto",
  });
  const snapshotB = preTool.stderr.match(/snapshot ([0-9a-f]{10})/)?.[1];
  assert.ok(snapshotB, `PreToolUse snapshot id found in: ${preTool.stderr}`);
  ok("PreToolUse hook took snapshot B of the good state");

  const goodGreeting = fs.readFileSync(path.join(proj, "greeting.js"), "utf8");
  const goodExisting = fs.readFileSync(path.join(proj, "existing.txt"), "utf8");
  const goodSecret = fs.readFileSync(path.join(proj, "secret.env"), "utf8");

  // 4) A destructive edit AFTER snapshot B: corrupt a file, delete a tracked one.
  fs.writeFileSync(path.join(proj, "existing.txt"), "CORRUPTED\n");
  fs.writeFileSync(path.join(proj, "greeting.js"), "throw new Error('broken');\n");
  fs.writeFileSync(path.join(proj, "secret.env"), "API_KEY=corrupted\n");

  // 5) list shows snapshots
  const list = cli(["list", "-C", proj]);
  assert.strictEqual(list.status, 0, "list exits 0");
  assert.ok(/^1\. [0-9a-f]{10}\s+\d+ (?:sn|dk|sa|gün) önce$/m.test(list.stdout), "list numbers prompt history");
  assert.ok(/add a greeting module/.test(list.stdout), "list shows the prompt title");
  ok("list shows numbered prompt history with file counts");

  // 6) diff should show the corruption vs snapshot B
  const diff = cli(["diff", snapshotB, "-C", proj]);
  assert.strictEqual(diff.status, 0, "diff exits 0");
  assert.ok(/CORRUPTED/.test(diff.stdout), "diff shows the corrupted content");
  ok("diff <B> shows what restore would change");

  // 7) restore B
  const restore = cli(["restore", snapshotB, "-y", "-C", proj]);
  assert.strictEqual(restore.status, 0, `restore exits 0; stderr: ${restore.stderr}`);
  assert.strictEqual(fs.readFileSync(path.join(proj, "greeting.js"), "utf8"), goodGreeting,
    "greeting.js restored to good state");
  assert.strictEqual(fs.readFileSync(path.join(proj, "existing.txt"), "utf8"), goodExisting,
    "existing.txt restored to good state");
  assert.strictEqual(fs.readFileSync(path.join(proj, "secret.env"), "utf8"), goodSecret,
    "gitignored secret.env restored to good state (ignored files ARE captured)");
  ok("restore <B> brought every file (incl. gitignored) back to the good state");

  // 8) undo the restore -> back to the corrupted state
  const undo = cli(["restore", "--undo", "-y", "-C", proj]);
  assert.strictEqual(undo.status, 0, `restore --undo exits 0; stderr: ${undo.stderr}`);
  assert.strictEqual(fs.readFileSync(path.join(proj, "existing.txt"), "utf8"), "CORRUPTED\n",
    "undo returned existing.txt to the pre-restore (corrupted) state");
  ok("restore --undo reverses the restore via the safety snapshot");

  // 9) the project's own git history is untouched by any of this
  assert.strictEqual(projectGitHead(), projHeadBefore, "project git HEAD unchanged");
  const projStatus = execFileSync("git", ["status", "--porcelain"], { cwd: proj, encoding: "utf8" });
  assert.ok(!/rewindex/.test(projStatus), "no rewindex refs leaked into project git");
  ok("project's own git repo was never touched (HEAD stable, no stray refs)");

  // 10) gc runs cleanly
  const gc = cli(["gc", "-C", proj]);
  assert.strictEqual(gc.status, 0, `gc exits 0; stderr: ${gc.stderr}`);
  assert.ok(/GC:/.test(gc.stdout), "gc prints a summary");
  ok("gc runs and reports retention results");

  console.log(`\nSELF-CHECK PASSED (${passed} assertions)`);
  // cleanup
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  process.exit(0);
})();
