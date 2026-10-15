# rewindex — git-free /undo for Codex CLI

> Name decided: **rewindex** (npm name verified free, GitHub clear). Package +
> binary name is `rewindex`. The repo directory stays `codex-rewind`.

## One-liner
OpenAI removed `/undo` from Codex CLI. This brings file-level rewind back:
automatic shadow-git snapshots before every file-mutating tool call, restore
with one command. Never touches the project's own git history.

## Why (validated demand, 2026-10)
- openai/codex #9203 "Please make /undo back" — ~482 upvotes, open, no vendor commitment.
- openai/codex #11626 "/rewind checkpoint restore" — ~228 upvotes.
- Esc-rewind only reverts conversation, not files. Maintainer: old impl "had problems", 9 months of silence.
- Competition: none found (verify again before launch — see tasks/todo.md #1).
- Comparable: claude-hud grew from a 203-upvote gap to 28.5k stars.

## How it works
1. Codex hooks (shipped 2026, config.toml / plugin hooks.json): a PreToolUse-class
   hook fires before file-mutating tools → snapshot changed files into a shadow
   git repo (`~/.rewindex/<project-hash>/`), tagged with session id + turn.
   Same design Gemini CLI uses natively (shadow-git checkpointing + /restore).
2. `rewindex` CLI/TUI: list snapshots (grouped by session/turn, with the
   prompt text from the session JSONL as label), diff, restore selected snapshot
   to working tree. Optionally print the `codex resume` command to fork the
   conversation from that point.
3. Install: `npx rewindex install` → writes hook config, done.

## v1 scope
- Snapshot on file-mutating hook events (apply_patch + shell edits if interceptable).
- `list`, `diff`, `restore` commands. Restore = files only (conversation rewind is Codex's job).
- Retention: size/time-capped, configurable.
- macOS + Linux. TypeScript (npx distribution).

## Not in v1
- Windows, conversation forking, GUI, multi-harness support (Claude Code has native /rewind — but its gaps: external edits, 100-snapshot/30-day caps → possible v2 angle "works where native rewind is limited").

## Positioning / launch
- README first line: the #9203 quote + "it's back".
- Post in #9203 and #11626 threads, X, r/ChatGPTCoding. No marketplace exists for Codex — npm + brew + the issue threads ARE the distribution. "Codex's first big third-party plugin" slot is open (Codex 129k★, no breakout plugin ecosystem yet).

## Key risks
1. Vendor ships native undo (maintainer said redesign needed — monitor releases).
2. Hooks can't intercept ALL mutation paths (shell `sed`/`rm`, MCP tools) → fallback: FS-watch mode.
3. Hook API churn (Codex broke config.toml profiles in v0.134 — pin + CI against codex releases).
