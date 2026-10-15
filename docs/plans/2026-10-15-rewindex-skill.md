# Rewindex Codex Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `rewindex install` add a safe user-level Codex skill invoked as `$rewindex list`, `$rewindex diff <id>`, `$rewindex restore <id>`, and `$rewindex undo`.

**Architecture:** Extend the existing installer to generate one owned `SKILL.md` beside the hook configuration, embedding the absolute CLI script path. Keep restore confirmation in the skill workflow because agent-run commands may have no interactive stdin. Refuse to overwrite an existing unowned skill and remove only owned generated content.

**Tech Stack:** Node.js 20+, TypeScript, Codex user skills, existing assert-based test scripts.

---

### Task 1: Add the failing installer check

**Files:**
- Create: `installcheck.js`
- Modify: `package.json`

**Step 1: Write the failing test**

Create an assert-based script that:

1. Creates temporary `CODEX_HOME` and `REWINDEX_HOME` directories.
2. Runs `node dist/cli.js install` with that environment.
3. Expects `skills/rewindex/SKILL.md` to exist.
4. Expects the skill to contain `$rewindex`, all four subcommands, the resolved `dist/cli.js` path, current-directory forwarding, ID validation, and explicit restore confirmation.
5. Runs install again and verifies the skill remains one owned file and hook groups are not duplicated.
6. Runs uninstall and verifies the owned skill is removed while an unrelated skill remains.
7. Creates an unowned `skills/rewindex/SKILL.md`, runs install, and verifies it fails without overwriting the file.

Add:

```json
"installcheck": "node installcheck.js"
```

to `package.json` scripts.

**Step 2: Run the check to verify it fails**

Run: `npm run build && npm run installcheck`

Expected: FAIL because `rewindex install` does not create `skills/rewindex/SKILL.md`.

**Step 3: Commit the failing test**

```bash
git add installcheck.js package.json
git commit -m "test: cover Codex skill installation"
```

### Task 2: Generate and remove the Codex skill

**Files:**
- Modify: `src/install.ts`

**Step 1: Add owned-skill helpers**

Add a unique generated-file marker, resolve `~/.codex/skills/rewindex/SKILL.md`, and build a concise skill body using the absolute `process.argv[1]` path. The body must route:

```text
$rewindex list
$rewindex diff <id>
$rewindex restore <id>
$rewindex undo
```

It must accept only hexadecimal snapshot IDs or `latest`/`last`, pass the session working directory with `-C`, run `diff` before restore, ask for explicit confirmation, and use `-y` only after confirmation.

**Step 2: Make installation safe and idempotent**

Before writing hooks, reject an existing skill file that lacks the ownership marker. Otherwise create its directory and write the generated file. Reinstall replaces the owned file and keeps exactly one hook group per event.

**Step 3: Make uninstall ownership-aware**

Remove `SKILL.md` only when it contains the marker. Remove the now-empty `rewindex` skill directory without recursively deleting user content. Leave unowned content untouched.

**Step 4: Run the focused check**

Run: `npm run build && npm run installcheck`

Expected: PASS.

**Step 5: Commit the implementation**

```bash
git add src/install.ts
git commit -m "feat: install rewindex Codex skill"
```

### Task 3: Update usage documentation and verify everything

**Files:**
- Modify: `README.md`
- Modify: `src/cli.ts`

**Step 1: Restore and update the user-facing documentation**

Document `$rewindex` as the primary in-Codex interface, retain the terminal CLI as an advanced/direct interface, and state that native `/rewindex` is not supported by Codex. Update install/uninstall help text to mention the skill.

**Step 2: Run all automated checks**

Run:

```bash
npm run build
npm run selfcheck
npm run edgecheck
npm run installcheck
git diff --check
```

Expected: build succeeds; 8 self-check assertions, 5 edge scenarios, and all installer checks pass; no whitespace errors.

**Step 3: Install locally and smoke-test discovery**

Run `node dist/cli.js install`, restart Codex in the non-Git scratch directory, invoke `$rewindex list`, and verify it displays that directory's snapshots. Trust the changed hooks through `/hooks` if Codex requests it.

**Step 4: Commit documentation**

```bash
git add README.md src/cli.ts
git commit -m "docs: document in-Codex rewindex commands"
```
