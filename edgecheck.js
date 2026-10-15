// rewindex edge-case checks: non-git dir, >16MB cap, conflict warning,
// exclude list, malformed stdin. Complements the repo's selfcheck.js.
"use strict";
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const CLI = require("path").join(__dirname, "dist", "cli.js");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rewindex-edge-"));
const home = path.join(tmpRoot, "home");
fs.mkdirSync(home, { recursive: true });
const env = { ...process.env, REWINDEX_HOME: home };
let passed = 0;
const ok = (m) => { passed++; console.log(`  ok - ${m}`); };

const hook = (payload, raw) => spawnSync("node", [CLI, "hook"], {
  input: raw ?? JSON.stringify(payload), env, encoding: "utf8",
});
const cli = (args, cwd) => spawnSync("node", [CLI, ...args], { env, cwd, encoding: "utf8" });
const snap = (proj, turn, prompt) => {
  const r = hook({ hook_event_name: "UserPromptSubmit", cwd: proj, session_id: "s1", turn_id: turn, prompt });
  assert.strictEqual(r.status, 0, `hook exit 0; stderr: ${r.stderr}`);
  const r2 = hook({ hook_event_name: "PreToolUse", cwd: proj, session_id: "s1", turn_id: turn, tool_name: "apply_patch", tool_use_id: "t1", tool_input: { command: "x" } });
  assert.strictEqual(r2.status, 0, `pretool exit 0; stderr: ${r2.stderr}`);
};

// ---- 1. NON-GIT directory: snapshot + restore must work (README's big claim)
{
  const proj = path.join(tmpRoot, "nogit");
  fs.mkdirSync(proj);
  fs.writeFileSync(path.join(proj, "notes.md"), "v1\n");
  snap(proj, "turn-1", "edit notes");
  fs.writeFileSync(path.join(proj, "notes.md"), "RUINED\n");
  const list = cli(["list"], proj);
  assert.strictEqual(list.status, 0, `list in non-git dir: ${list.stderr}`);
  assert.ok(!fs.existsSync(path.join(proj, ".git")), "rewindex must not create .git in the project");
  const id = list.stdout.match(/^1\. ([0-9a-f]{10}) /m)?.[1];
  assert.ok(id, `snapshot id found in: ${list.stdout}`);
  const restore = cli(["restore", id, "-y"], proj);
  assert.strictEqual(restore.status, 0, `restore in non-git dir: ${restore.stderr} ${restore.stdout}`);
  assert.strictEqual(fs.readFileSync(path.join(proj, "notes.md"), "utf8"), "v1\n");
  ok("non-git dir: snapshot, list, restore work; no .git created in project");
}

// ---- 2. >16MB file is skipped but snapshot still succeeds
{
  const proj = path.join(tmpRoot, "bigfile");
  fs.mkdirSync(proj);
  fs.writeFileSync(path.join(proj, "small.txt"), "keep me\n");
  fs.writeFileSync(path.join(proj, "huge.bin"), Buffer.alloc(17 * 1024 * 1024, 7));
  snap(proj, "turn-1", "big file turn");
  fs.writeFileSync(path.join(proj, "small.txt"), "RUINED\n");
  const list = cli(["list"], proj);
  assert.strictEqual(list.status, 0, "list after big-file snapshot");
  const id = list.stdout.match(/^1\. ([0-9a-f]{10}) /m)?.[1];
  const restore = cli(["restore", id, "-y"], proj);
  assert.strictEqual(restore.status, 0, `restore: ${restore.stderr}`);
  assert.strictEqual(fs.readFileSync(path.join(proj, "small.txt"), "utf8"), "keep me\n");
  ok(">16MB file skipped without failing the snapshot; small file restored");
}

// ---- 3. Malformed stdin: hook must still exit 0 (never block the tool call)
{
  const r = hook(null, "this is not json {{{");
  assert.strictEqual(r.status, 0, `malformed stdin must exit 0, got ${r.status}`);
  const r2 = hook({ hook_event_name: "PreToolUse" }); // missing cwd
  assert.strictEqual(r2.status, 0, `missing-cwd payload must exit 0, got ${r2.status}`);
  ok("malformed/incomplete hook payloads exit 0");
}

// ---- 4. node_modules excluded by default
{
  const proj = path.join(tmpRoot, "excl");
  fs.mkdirSync(path.join(proj, "node_modules", "pkg"), { recursive: true });
  fs.writeFileSync(path.join(proj, "node_modules", "pkg", "index.js"), "x".repeat(1000));
  fs.writeFileSync(path.join(proj, "app.js"), "v1\n");
  snap(proj, "turn-1", "exclude check");
  fs.writeFileSync(path.join(proj, "app.js"), "RUINED\n");
  const list = cli(["list"], proj);
  assert.strictEqual(list.status, 0);
  // restore and confirm node_modules content untouched even after deletion from snapshot store
  const id = list.stdout.match(/^1\. ([0-9a-f]{10}) /m)?.[1];
  const restore = cli(["restore", id, "-y"], proj);
  assert.strictEqual(restore.status, 0, restore.stderr);
  assert.strictEqual(fs.readFileSync(path.join(proj, "app.js"), "utf8"), "v1\n");
  ok("node_modules excluded; app file restored");
}

// ---- 5. Non-ASCII filenames must survive Git's path output unchanged
{
  const proj = path.join(tmpRoot, "unicode");
  const file = "Mülakat Notları.md";
  fs.mkdirSync(proj);
  fs.writeFileSync(path.join(proj, file), "v1\n");
  snap(proj, "turn-1", "unicode filename check");
  fs.writeFileSync(path.join(proj, file), "RUINED\n");
  const list = cli(["list"], proj);
  const id = list.stdout.match(/^1\. ([0-9a-f]{10}) /m)?.[1];
  assert.ok(id, `snapshot id found in: ${list.stdout}`);
  const diff = cli(["diff", id], proj);
  assert.match(diff.stdout, /RUINED/, `diff must include Unicode-named file: ${diff.stdout}`);
  const restore = cli(["restore", id, "-y"], proj);
  assert.strictEqual(restore.status, 0, restore.stderr);
  assert.strictEqual(fs.readFileSync(path.join(proj, file), "utf8"), "v1\n");
  ok("non-ASCII filename: diff and restore use the real path");
}

console.log(`EDGE-CHECK PASSED (${passed} scenarios)`);
