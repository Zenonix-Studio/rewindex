# rewindex

File-level rewind for OpenAI Codex CLI, including projects that do not use Git.

Codex can rewind a conversation, but that does not restore files already written to disk. `rewindex` takes automatic snapshots in an isolated shadow Git repository and lets you return the working tree to the state before an earlier prompt.

It never reads or modifies your project's own Git repository.

## Install

```sh
npm install --global rewindex
rewindex install
```

Open Codex in an unimportant folder, run `/hooks`, and trust the two `rewindex` hooks. Codex requires this explicit review before third-party hooks can run.

## Use inside Codex

```text
$rewindex list
$rewindex diff 3
$rewindex restore 3
$rewindex undo
```

`list` shows the newest 50 prompt checkpoints:

```text
1. dcdf6bb9f1                                      3 min ago
                              1 modified · 0 added · 0 deleted
   Prompt: Update the README with the new installation steps.
   Summary: README.md returns to its previous state.
```

The visible number is a convenient selector for the current list. The hash is a stable selector that remains valid if newer prompts change the numbering.

Restore always shows a diff first and asks for confirmation. Before changing files, it takes a safety snapshot; `$rewindex undo` restores that pre-restore state.

## Direct CLI

The same operations are available outside Codex:

```sh
rewindex list
rewindex diff 3
rewindex restore 3
rewindex restore --undo
rewindex gc
```

Add `-C <directory>` to target another project and `-y` to skip restore confirmation in scripts.

## How it works

1. `UserPromptSubmit` records the state before each prompt.
2. `PreToolUse` provides extra safety checkpoints before shell and file tools.
3. Snapshots are stored in `~/.rewindex/<project-hash>/`, with `GIT_DIR` isolated from the project.
4. Prompt history is presented as cumulative rewind points: restoring item 4 undoes that prompt and every newer file change.

Tracked, untracked, and Git-ignored files are captured by default. Common build directories and files larger than 16 MiB are excluded.

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

## Security

Because Git-ignored files are captured by default, local snapshots may contain `.env` files, credentials, or other secrets. They remain unencrypted on the same machine under `~/.rewindex/` and are never added to the project repository.

Set `"captureIgnored": false` or add sensitive paths to `exclude` when local secret snapshots are not acceptable.

## Limits

- Rewinds files, not the Codex conversation. Use Codex's conversation controls separately.
- Cannot undo external effects such as database writes, network calls, or files changed outside the project.
- Does not currently support Windows.
- Cannot observe tools that bypass Codex hooks.

## Uninstall

```sh
rewindex uninstall
npm uninstall --global rewindex
```

`rewindex uninstall` removes only hook entries owned by rewindex.

## License

[MIT](LICENSE) © 2026 Zenonix Studio
