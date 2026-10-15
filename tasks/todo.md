# codex-rewind — validation & build plan

## Phase 0 — validation (do BEFORE writing product code)
- [ ] 1. Re-verify competition is still zero: GitHub search (codex undo / checkpoint / rewind / snapshot / shadow git), npm, Show HN. Also re-check #9203/#11626 are still open and no OpenAI roadmap signal in recent release notes.
- [ ] 2. Enumerate Codex hook events on THIS machine (codex-cli 0.147.0): official hooks docs (developers.openai.com/codex/hooks), confirm a pre-tool event exists, dump its payload (write a logging hook, run a toy session).
- [ ] 3. Mutation-path coverage test: does the pre-tool event fire for (a) apply_patch, (b) shell commands that edit files, (c) MCP tools? Record which paths are blind → decides if FS-watch fallback is v1 or v2.
- [ ] 4. Session JSONL: confirm ~/.codex/sessions format has turn ids + prompt text usable as snapshot labels.
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
