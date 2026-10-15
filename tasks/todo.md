# codex-rewind — validation & build plan

## ⚠️ Phase 0 result (2026-10-15): GO, with a rename and a sharpened wedge
- **Name "codex-rewind" is TAKEN**: extracurricular-ai/codex-rewind (54★, npm 1,329 dl/mo) — a FORK distribution (`codexr`). Rename required (also taken: turnback, snap-back, codex-undo, agentckpt). Decide new name before any publishing.
- Competition is NOT zero (≥10 attempts) but weak/fragmented: best is the 54★ fork (trust objection: "I really only trust 1st-party… if you had like 1k stars" — the loudest commenters refuse to replace the official binary). Hooks-native rivals are 0★ and days old (majiayu000/codex-undo, Rust, Oct 7). Our wedge: official-binary hooks architecture + Gemini-proven shadow git + the gaps everyone leaves (gitignored files, GC, diff preview).
- Demand re-verified: #9203 532 reactions / #11626 229, both open, zero roadmap signal through v0.162.1. Old /undo = GhostCommit writing into the USER'S repo → index clobbering (#8214) → unshipped 2 days later (PR #8424). Codex Desktop checkpoints left 102GB orphan objects (#29388). Community law: never touch user's .git/index/stash, always GC.
- Hooks docs (learn.chatgpt.com/docs/hooks): 12 events; PreToolUse payload has NO structured file paths (parse from apply_patch body; Bash unknowable) → snapshot at TURN granularity, whole-tree, not per-file. UserPromptSubmit gives turn_id+prompt for labels. Trust model: non-managed hooks need /hooks review per change (design install UX around it). Snapshot hook must be SYNCHRONOUS (Gemini #13486 lesson).
- Gemini shadow-git design to steal: GIT_DIR + GIT_WORK_TREE env split, isolated GIT_CONFIG_GLOBAL/SYSTEM + own identity + --no-verify, path-locked snapshot, --allow-empty root, clean without -x. Their 6 documented mistakes to fix: gitignored files skipped, no GC/caps, async silent snapshots, approval-coupled triggers, no diff preview, whole-tree-only restore.

### v1 cut (from 141 issue comments, P0):
1. Auto-snapshot on PreToolUse (apply_patch + shell), per-turn grouping, shadow store outside project .git, works in NON-GIT dirs, captures untracked AND gitignored files (opt-out for secrets).
2. restore = FILES ONLY (+82-reaction comment: "I don't care about the damn conversation rewind" — Esc-Esc already does chat; print a hint).
3. Diff preview + explicit confirm + conflict detection; only touch files the snapshot knows.
4. Safety snapshot before restore → free redo.
5. Size caps + GC (the two shipped disasters were index clobbering and unbounded disk).
P1: selective per-file restore; checkpoint list with timestamp+prompt snippet. Non-goals (say loudly): DB/network side effects, replacing git, conversation surgery.

## Phase 0 — validation
- [x] 1. DONE — see result above. Rename required.
- [x] 2. DONE (2026-10-15, binary strings on codex-cli 0.147.0): full event enum recovered — PreToolUse, PermissionRequest, PostToolUse, PreCompact, PostCompact, SessionStart, SessionEnd, UserPromptSubmit, SubagentStart, SubagentStop, Stop. Payload fields: session_id, turn_id, agent_type, transcript_path, cwd, hook_event_name, model, permission_mode, tool_name, tool_input, tool_use_id (+tool_response on PostToolUse). Decisions: approve/block/allow/deny, exit code 2 = block w/ stderr reason, updatedInput/updatedPermissions/additionalContext. hooks.json format = Claude Code-style (verified via ponytail plugin: hooks/claude-codex-hooks.json). `hooks` feature flag: stable+true.
  - KEY FINDING: `undo` feature flag marked "removed" (confirmed gone), BUT `ghost_snapshot` infra still in binary (GhostSnapshotToml config, rollout-line format w/ legacy handling). Dormant in current sessions (no ghost lines in 0.144 rollouts, no git refs left in repos). Two readings: (a) OpenAI may rebuild /undo on it = durability risk; (b) if it reactivates, rewind could piggyback. Monitor releases.
- [ ] 3. Mutation-path coverage test (LIVE test still needed): does PreToolUse fire for (a) apply_patch, (b) shell commands that edit files, (c) MCP tools? Use sandboxed CODEX_HOME + logging hook + one tiny `codex exec` run. Blind paths → FS-watch fallback decision.
- [x] 4. DONE: rollout JSONL verified — session_meta (cwd, session_id, cli_version), turn_id present on records, event types catalogued. Snapshot labeling data exists.
- [x] 5. DONE — design + 6 mistakes documented above (source: gitService.ts, issues 7328/13486/8436/15598/16896/4645).
- [x] 6. DONE — v1 cut above. Remaining live test: todo #3 (mutation-path coverage with sandboxed CODEX_HOME).

## Phase 1 — MVP (target: 2 weeks after validation passes)
- [ ] Shadow-git snapshot engine (isolated repo per project, GIT_DIR trickery, no touching project .git)
- [ ] Hook installer (`install` / `uninstall`, idempotent, never clobbers existing hooks)
- [ ] `list` / `diff` / `restore` commands
- [ ] Retention/GC
- [ ] Self-check: scripted toy session → mutate → restore → assert files match

## Phase 2 — launch
- [ ] README with demo GIF (break something → `codex-rewind restore` → fixed)
- [ ] npm publish + brew tap
- [ ] Post in #9203, #11626, X, r/ChatGPTCoding
- [ ] Submit to awesome lists

## Open decisions
- Name (codex-rewind vs timewarp vs other)
- TS vs Rust (TS favored: npx install friction ~zero)

## Review
(fill after each phase)
