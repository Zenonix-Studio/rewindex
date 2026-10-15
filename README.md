# rewindex

> "Please make /undo back" — [openai/codex #9203](https://github.com/openai/codex/issues/9203) (500+ reactions, open, no vendor commitment)

**It's back.** OpenAI removed `/undo` from the Codex CLI. `rewindex` brings file-level rewind back — and goes further: it **restores your files, not just your conversation.**

Codex's `Esc Esc` rewinds the *chat*. It does nothing for the files Codex already wrote to disk. `rewindex` snapshots your working tree **before every file-mutating tool call** and lets you jump back to any point with one command.

```
rewindex list                 # see every checkpoint, grouped by turn
rewindex diff a1b2c3d4e5       # what would restoring this change?
rewindex restore a1b2c3d4e5    # roll the files back (preview + confirm)
rewindex restore --undo        # changed your mind — undo the restore
```

## Why hooks, not a fork

The loudest objection to every third-party Codex undo tool is trust:

> "I really only trust 1st-party… if you had like 1k stars."

So `rewindex` **does not replace or wrap the `codex` binary.** It installs as two
official [Codex hooks](https://learn.chatgpt.com/docs/hooks) (`PreToolUse` and
`UserPromptSubmit`) that Codex itself calls. You keep running the real `codex`.
You review and trust the hooks yourself via `/hooks`. `rewindex` is just a small
local program Codex invokes — nothing is intercepted, nothing is monkey-patched.

## How it works

1. **Hooks fire before Codex touches files.** On every `PreToolUse` (and on each
   new prompt via `UserPromptSubmit`), Codex runs `rewindex hook`, which takes a
   **synchronous** snapshot of your working tree, then exits immediately. If the
   snapshot ever fails, it logs a warning and still exits `0` — **it never blocks
   or delays your Codex session.**
2. **Snapshots live in an isolated shadow git repo**, not your project's. The
   store sits in `~/.rewindex/<project-hash>/` with its own `GIT_DIR`, its own
   identity, and isolated config. **Your project's `.git`, index, and stash are
   never touched** — the exact mistake that got the original `/undo` pulled two
   days after it shipped ([index clobbering, #8214](https://github.com/openai/codex/issues/8214)).
3. **It captures everything that matters** — tracked, untracked, *and* gitignored
   files (so your `.env`, local configs, and build output come back too), minus a
   configurable exclude list (`node_modules`, `.git`, …) and a per-file size cap.
4. **Restore is safe by default.** Every restore shows a diff preview, asks for
   confirmation, takes a safety snapshot of the current state first, and only
   touches files the snapshot knows about. `rewindex restore --undo` reverses it.

## Install

```
npm install -g rewindex      # or: npx rewindex <command>
rewindex install             # writes hooks into ~/.codex/hooks.json
```

Then, **in the Codex CLI, run `/hooks`** and mark the two `rewindex` entries as
trusted. Codex requires this review for any non-managed hook — until you trust
them, Codex skips them and no snapshots are taken (it warns you at startup). If
you later upgrade `rewindex`, re-run `/hooks` to re-trust the changed command.

To remove:

```
rewindex uninstall           # removes only rewindex's hooks; yours stay put
```

## Commands

| Command | What it does |
|---|---|
| `rewindex install` / `uninstall` | Add/remove the snapshot hooks (idempotent, never clobbers your other hooks) |
| `rewindex list` | List checkpoints, grouped by turn, with the prompt snippet, time, and files changed |
| `rewindex diff <id>` | Show what restoring `<id>` would change in your working tree |
| `rewindex restore <id>` | Restore files from a checkpoint (diff preview + confirm + safety snapshot) |
| `rewindex restore --undo` | Undo the most recent restore |
| `rewindex gc` | Prune old snapshots (default retention: 7 days / 500 MB) |

Add `-C <dir>` to operate on a project other than the current directory, and
`-y` to skip the restore confirmation.

## Configuration

Optional `~/.rewindex/config.json`:

```json
{
  "exclude": [".git", "node_modules", "dist", "build"],
  "maxFileBytes": 16777216,
  "retentionDays": 7,
  "retentionBytes": 524288000,
  "captureIgnored": true
}
```

### ⚠️ Secrets caveat

Because `rewindex` captures **gitignored** files by design, your snapshots can
contain secrets (`.env`, credentials, tokens) that your project's `.gitignore`
deliberately keeps out of git. Those snapshots live unencrypted in
`~/.rewindex/`. If that's not acceptable for your machine, set
`"captureIgnored": false` in the config (you lose the ability to restore
gitignored files), or add specific paths to `exclude`.

## Non-goals (stated loudly)

`rewindex` is a **file time machine, nothing more.** It explicitly does **not**:

- **Rewind your conversation.** That's Codex's job — press `Esc Esc`. `rewindex`
  only restores files and prints a reminder.
- **Undo side effects.** Database writes, network calls, emails sent, `rm` on
  files outside the project — gone is gone. Snapshots are of your working tree.
- **Replace git.** It never commits to, reads, or rewrites your project's own
  repository. Use real git for real history.
- **Support Windows (yet)** or intercept mutation paths Codex doesn't expose via
  hooks (e.g. edits made by MCP tools that bypass `apply_patch`/shell).

## License

MIT
