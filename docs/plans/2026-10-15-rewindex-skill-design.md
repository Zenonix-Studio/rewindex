# Rewindex Codex Skill Design

## Goal

Install a user-level Codex skill so users can run rewindex from a Codex session as `$rewindex list`, `$rewindex diff <id>`, `$rewindex restore <id>`, or `$rewindex undo` without installing a global shell command.

## Architecture

`rewindex install` writes `~/.codex/skills/rewindex/SKILL.md` alongside the existing hook configuration. The generated skill embeds the absolute path to the running `dist/cli.js`, so it works for local development and packaged installs without relying on `PATH`.

`rewindex uninstall` removes only the generated rewindex skill. Existing hooks and unrelated skills remain untouched.

## Command Flow

- `list`: run the CLI list command for the Codex session's current working directory.
- `diff <id>`: run the CLI diff command for that directory.
- `restore <id>`: show the diff, ask for explicit confirmation in chat, then run restore with `-y`.
- `undo`: ask for explicit confirmation in chat, then run `restore --undo -y`.
- Missing or unsupported arguments: print concise usage and make no changes.

The confirmation stays in the skill because agent-run shell commands may not have interactive stdin, while restore must remain safe by default.

## Testing

Use a temporary `CODEX_HOME` to verify install, reinstall, and uninstall without touching the user's real Codex configuration. Assert that the generated skill contains the resolved CLI path, command routing, current-directory handling, and restore confirmation rules. Keep the existing snapshot and restore checks unchanged, then manually smoke-test `$rewindex list` in Codex.

## Non-goals

- Native `/rewindex` slash-command syntax.
- An MCP server or background daemon.
- A globally installed `rewindex` shell command.
