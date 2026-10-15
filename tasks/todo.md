# codex-rewind — validation & build plan

## Phase 0 — validation (do BEFORE writing product code)
- [ ] 1. Re-verify competition is still zero: GitHub search (codex undo / checkpoint / rewind / snapshot / shadow git), npm, Show HN. Also re-check #9203/#11626 are still open and no OpenAI roadmap signal in recent release notes.
- [x] 2. DONE (2026-10-15, binary strings on codex-cli 0.147.0): full event enum recovered — PreToolUse, PermissionRequest, PostToolUse, PreCompact, PostCompact, SessionStart, SessionEnd, UserPromptSubmit, SubagentStart, SubagentStop, Stop. Payload fields: session_id, turn_id, agent_type, transcript_path, cwd, hook_event_name, model, permission_mode, tool_name, tool_input, tool_use_id (+tool_response on PostToolUse). Decisions: approve/block/allow/deny, exit code 2 = block w/ stderr reason, updatedInput/updatedPermissions/additionalContext. hooks.json format = Claude Code-style (verified via ponytail plugin: hooks/claude-codex-hooks.json). `hooks` feature flag: stable+true.
  - KEY FINDING: `undo` feature flag marked "removed" (confirmed gone), BUT `ghost_snapshot` infra still in binary (GhostSnapshotToml config, rollout-line format w/ legacy handling). Dormant in current sessions (no ghost lines in 0.144 rollouts, no git refs left in repos). Two readings: (a) OpenAI may rebuild /undo on it = durability risk; (b) if it reactivates, rewind could piggyback. Monitor releases.
- [ ] 3. Mutation-path coverage test (LIVE test still needed): does PreToolUse fire for (a) apply_patch, (b) shell commands that edit files, (c) MCP tools? Use sandboxed CODEX_HOME + logging hook + one tiny `codex exec` run. Blind paths → FS-watch fallback decision.
- [x] 4. DONE: rollout JSONL verified — session_meta (cwd, session_id, cli_version), turn_id present on records, event types catalogued. Snapshot labeling data exists.
- [ ] 5. Read Gemini CLI checkpointing source (google-gemini/gemini-cli) — reuse the shadow-git design decisions.
- [ ] 6. Read ALL comments on #9203 + #11626 — list concrete user asks, decide v1 cut.

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
