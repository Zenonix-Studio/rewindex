# Prompt History Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the low-level snapshot listing with a numbered, cumulative prompt history and make restore return every captured file to the selected prompt baseline.

**Architecture:** Force a metadata commit at every `UserPromptSubmit`, then derive visible entries only from ordinary prompt commits. Compute each entry's cumulative current-vs-baseline name-status diff for numbering, summary, preview, and restore; keep low-level checkpoints hidden but hash-addressable.

**Tech Stack:** Node.js 20+, TypeScript, isolated shadow Git, assert-based end-to-end scripts.

---

### Task 1: Add a failing prompt-history end-to-end check

**Files:**
- Create: `historycheck.js`
- Modify: `package.json`

**Steps:**

1. Create a non-Git temporary project and isolated `REWINDEX_HOME`.
2. Simulate ordinary `UserPromptSubmit` boundaries with file modification, creation, and deletion between them.
3. Add a `$rewindex list` boundary and assert it is hidden.
4. Assert list output is numbered newest-first, contains stable IDs, titles, cumulative affected-file counts, and deterministic added/modified/deleted summaries.
5. Assert `diff 1` and `diff <hash>` select the same baseline.
6. Assert `restore N` removes files created after the baseline, recreates deleted files, restores modified files, and `restore --undo` reverses all three.
7. Add 51 meaningful prompt states and assert only 50 entries appear.
8. Add `"historycheck": "node historycheck.js"` to package scripts.
9. Run `npm run build && npm run historycheck`; verify it fails because the current list is low-level and numeric IDs are unsupported.
10. Commit the failing check.

### Task 2: Record reliable prompt boundaries and derive history entries

**Files:**
- Modify: `src/git.ts`
- Modify: `src/hook.ts`
- Modify: `src/snapshot.ts`

**Steps:**

1. Extend `ShadowGit.snapshot` with a boolean allowing an empty metadata commit.
2. Pass that boolean only for `UserPromptSubmit` hooks.
3. Add a NUL-safe, no-renames name-status query from a snapshot to the current captured tree/worktree.
4. Build prompt entries from `UserPromptSubmit` checkpoints whose prompt does not begin with `$rewindex` and whose cumulative diff is non-empty.
5. Limit visible entries to 50 and resolve decimal `1..50` against that list while retaining hash lookup.
6. Run the focused history check and existing checks.
7. Commit.

### Task 3: Format list and implement complete restore

**Files:**
- Modify: `src/commands.ts`
- Modify: `src/git.ts`

**Steps:**

1. Print `Son 50 değişiklik`, then `N. <id> · <count> dosya · <title> <relative-time>` and a deterministic `Özet:` line.
2. Make `diff` compare the complete captured current state with the selected baseline, including later-created files.
3. Make restore checkout paths present in the baseline and unlink only captured paths absent from the baseline.
4. Keep the pre-restore safety snapshot and make undo use the same complete restore path.
5. Run history, self, edge, and installer checks.
6. Commit.

### Task 4: Update the installed skill and verify live behavior

**Files:**
- Modify: `src/install.ts`
- Modify: `src/cli.ts`
- Modify: `installcheck.js`

**Steps:**

1. Teach the generated skill to accept list numbers `1..50` as well as snapshot hashes.
2. Update CLI help from `<id>` to `<number|id>` without touching the user's modified README.
3. Build and run every automated check plus `git diff --check`.
4. Run `node dist/cli.js install` to refresh the live skill.
5. In a fresh Codex process rooted at `~/rewindex_temp`, run `$rewindex list` and verify the numbered format.
6. Commit the skill/help changes.
