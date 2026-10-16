# Prompt History Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Render each prompt checkpoint as a readable multi-line item with two-line prompt wrapping, path-aware restore summary, and right-aligned time and change counts.

**Architecture:** Keep checkpoint collection and selector resolution unchanged. Add small formatting helpers inside `src/commands.ts`, then exercise them through the existing end-to-end `historycheck.js` CLI test.

**Tech Stack:** TypeScript, Node.js standard library, assert-based integration checks

---

### Task 1: Define the new CLI output

**Files:**
- Modify: `historycheck.js:46-79`

**Step 1: Write the failing test**

- Make one prompt long enough to wrap.
- Assert that item headers contain only number/hash on the left and relative time at the right edge.
- Assert that the next line ends with `N değişen · N eklenen · N silinen`.
- Assert the prompt occupies no more than two `Prompt:`/continuation lines.
- Assert the summary names `main.txt`, `a.txt`, `b.txt`, and `old.txt` with the restore actions.
- Preserve the existing number-versus-hash diff assertion.

**Step 2: Run test to verify it fails**

Run: `npm run build && npm run historycheck`

Expected: FAIL because the current list is a one-line title with a count-only summary.

**Step 3: Commit the failing test**

```bash
git add historycheck.js
git commit -m "test: define readable prompt history layout"
```

### Task 2: Render the approved layout

**Files:**
- Modify: `src/commands.ts:30-62`

**Step 1: Write minimal implementation**

- Use an 88-character output width.
- Right-align relative time and the count string with `padStart`.
- Wrap normalized prompt words into two lines, truncating overflow with `…`.
- Group cumulative changes by Git status: `A` is added/currently removable, `D` is deleted/currently recreatable, everything else is changed/restorable.
- Build the summary from up to three paths per group and append a remaining-count suffix when needed.

**Step 2: Run focused checks**

Run: `npm run build && npm run historycheck`

Expected: `HISTORY-CHECK PASSED`.

**Step 3: Commit**

```bash
git add src/commands.ts
git commit -m "feat: improve prompt history list layout"
```

### Task 3: Verify the complete feature

**Files:**
- No code changes expected

**Step 1: Run all automated checks**

Run: `npm run build && npm run selfcheck && npm run edgecheck && npm run installcheck && npm run historycheck && git diff --check`

Expected: all checks exit 0.

**Step 2: Inspect the real non-Git test folder**

Run: `node dist/cli.js list -C /Users/anilkul/rewindex_temp`

Expected: right-aligned multi-line entries; existing snapshots remain intact.
