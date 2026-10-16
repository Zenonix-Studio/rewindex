#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const CLI = path.join(__dirname, "dist", "cli.js");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rewindex-history-"));
const home = path.join(tmpRoot, "home");
const env = { ...process.env, REWINDEX_HOME: home };
let passed = 0;

function ok(message) {
  passed++;
  console.log(`  ok - ${message}`);
}

function hook(cwd, prompt, turn) {
  const result = spawnSync("node", [CLI, "hook"], {
    input: JSON.stringify({
      hook_event_name: "UserPromptSubmit",
      session_id: "history-session",
      turn_id: turn,
      cwd,
      prompt,
    }),
    env,
    encoding: "utf8",
  });
  assert.strictEqual(result.status, 0, result.stderr);
}

function cli(cwd, ...args) {
  return spawnSync("node", [CLI, ...args, "-C", cwd], { env, encoding: "utf8" });
}

try {
  const project = path.join(tmpRoot, "project");
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(project, "main.txt"), "base\n");
  fs.writeFileSync(path.join(project, "old.txt"), "keep\n");

  hook(project, "A dosyasını ekle", "turn-a");
  fs.writeFileSync(path.join(project, "main.txt"), "after A\n");
  fs.writeFileSync(path.join(project, "a.txt"), "A\n");

  hook(project, "B dosyasını ekle", "turn-b");
  fs.writeFileSync(path.join(project, "main.txt"), "after B\n");
  fs.writeFileSync(path.join(project, "b.txt"), "B\n");

  hook(
    project,
    "Eski dosyayı kaldır, ana dosyayı güncelle ve bu değişikliklerin geri alınabildiğini doğrulamak için açıklayıcı, ayrıntılı ve uzun bir test akışı oluştur",
    "turn-c",
  );
  fs.writeFileSync(path.join(project, "main.txt"), "after C\n");
  fs.unlinkSync(path.join(project, "old.txt"));

  hook(project, "$rewindex list", "turn-list");

  const list = cli(project, "list");
  assert.strictEqual(list.status, 0, list.stderr);
  assert.match(list.stdout, /^Son 50 değişiklik/m);
  assert.match(list.stdout, /^1\. [0-9a-f]{10}\s+\d+ (?:sn|dk|sa|gün) önce$/m);
  assert.match(list.stdout, /^2\. [0-9a-f]{10}\s+\d+ (?:sn|dk|sa|gün) önce$/m);
  assert.match(list.stdout, /^3\. [0-9a-f]{10}\s+\d+ (?:sn|dk|sa|gün) önce$/m);
  assert.doesNotMatch(list.stdout, /\$rewindex list/);
  const firstItem = list.stdout.split("\n").findIndex((line) => /^1\. /.test(line));
  const firstLines = list.stdout.split("\n").slice(firstItem, firstItem + 6);
  assert.strictEqual(firstLines[0].length, 88, firstLines[0]);
  assert.strictEqual(firstLines[1].length, 88, firstLines[1]);
  assert.match(firstLines[1], /1 değişen · 0 eklenen · 1 silinen$/);
  assert.match(firstLines[2], /^   Prompt: Eski dosyayı kaldır/);
  assert.match(firstLines[3], /^           .*…$/);
  assert.match(firstLines[4], /^   Özet: main\.txt önceki haline döner; old\.txt yeniden oluşturulur\.$/);
  assert.match(
    list.stdout,
    /Özet: main\.txt önceki haline döner; a\.txt ve b\.txt kaldırılır; old\.txt yeniden\s+oluşturulur\./,
  );
  ok("list wraps prompts, explains file actions, and right-aligns metadata");

  const oldestId = list.stdout.match(/^3\. ([0-9a-f]{10})/m)?.[1];
  assert.ok(oldestId, list.stdout);
  const numberedDiff = cli(project, "diff", "3");
  const hashDiff = cli(project, "diff", oldestId);
  assert.strictEqual(numberedDiff.status, 0, numberedDiff.stderr);
  assert.strictEqual(numberedDiff.stdout, hashDiff.stdout);
  assert.match(numberedDiff.stdout, /a\.txt/);
  assert.match(numberedDiff.stdout, /b\.txt/);
  assert.match(numberedDiff.stdout, /old\.txt/);
  ok("list numbers and stable hashes resolve to the same cumulative diff");

  const restore = cli(project, "restore", "3", "-y");
  assert.strictEqual(restore.status, 0, `${restore.stdout}\n${restore.stderr}`);
  assert.strictEqual(fs.readFileSync(path.join(project, "main.txt"), "utf8"), "base\n");
  assert.strictEqual(fs.readFileSync(path.join(project, "old.txt"), "utf8"), "keep\n");
  assert.ok(!fs.existsSync(path.join(project, "a.txt")));
  assert.ok(!fs.existsSync(path.join(project, "b.txt")));
  ok("restore returns modified, deleted, and created files to the prompt baseline");

  const undo = cli(project, "restore", "--undo", "-y");
  assert.strictEqual(undo.status, 0, `${undo.stdout}\n${undo.stderr}`);
  assert.strictEqual(fs.readFileSync(path.join(project, "main.txt"), "utf8"), "after C\n");
  assert.ok(!fs.existsSync(path.join(project, "old.txt")));
  assert.strictEqual(fs.readFileSync(path.join(project, "a.txt"), "utf8"), "A\n");
  assert.strictEqual(fs.readFileSync(path.join(project, "b.txt"), "utf8"), "B\n");
  ok("restore --undo recovers the complete pre-restore state");

  const directProject = path.join(tmpRoot, "direct-project");
  fs.mkdirSync(directProject);
  fs.writeFileSync(path.join(directProject, "base.txt"), "base\n");
  hook(directProject, "Yeni dosya oluştur", "turn-direct");
  fs.writeFileSync(path.join(directProject, "later.txt"), "later\n");
  hook(directProject, "$rewindex list", "turn-direct-list");
  const directStore = path.join(
    home,
    crypto.createHash("sha256").update(fs.realpathSync(directProject)).digest("hex").slice(0, 16),
    "git",
  );
  fs.chmodSync(directStore, 0o555);
  const directList = cli(directProject, "list");
  fs.chmodSync(directStore, 0o755);
  assert.strictEqual(directList.status, 0, directList.stderr);
  assert.match(directList.stdout, /^1\. [0-9a-f]{10}\s+\d+ (?:sn|dk|sa|gün) önce$/m);
  assert.match(directList.stdout, /^   Prompt: Yeni dosya oluştur$/m);
  const directRestore = cli(directProject, "restore", "1", "-y");
  assert.strictEqual(directRestore.status, 0, directRestore.stderr);
  assert.ok(!fs.existsSync(path.join(directProject, "later.txt")));
  ok("list remains read-only after the prompt hook captures the current state");

  const cappedProject = path.join(tmpRoot, "capped-project");
  fs.mkdirSync(cappedProject);
  const counter = path.join(cappedProject, "counter.txt");
  fs.writeFileSync(counter, "base\n");
  for (let i = 1; i <= 51; i++) {
    hook(cappedProject, `change ${i}`, `turn-${i}`);
    fs.writeFileSync(counter, `${i}\n`);
  }
  hook(cappedProject, "$rewindex list", "turn-capped-list");
  const capped = cli(cappedProject, "list");
  const rows = capped.stdout.match(/^\d+\. /gm) || [];
  assert.strictEqual(rows.length, 50, capped.stdout);
  assert.match(capped.stdout, /^   Prompt: change 51$/m);
  assert.doesNotMatch(capped.stdout, /^   Prompt: change 1$/m);
  ok("list is capped at the newest 50 meaningful prompts");

  console.log(`HISTORY-CHECK PASSED (${passed} scenarios)`);
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
