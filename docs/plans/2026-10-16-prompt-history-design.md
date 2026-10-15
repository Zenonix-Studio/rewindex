# Prompt History Design

## Goal

Present rewindex as a high-level prompt history: at most 50 meaningful file-changing prompts, numbered newest-first, where restoring entry `N` returns the entire captured workspace to the state immediately before that prompt.

## User Interface

```text
Son 50 değişiklik

1. 99e63fd5c5 · 12 dosya · Login ekranını ekle                  8 dk önce
   Özet: Bu noktaya dönünce 3 dosya silinir, 8 dosya geri alınır, 1 dosya yeniden oluşturulur.
```

Both the transient list number and stable snapshot ID are accepted:

```text
$rewindex diff 1
$rewindex restore 1
$rewindex diff 99e63fd5c5
```

Management prompts beginning with `$rewindex` are hidden. Internal `PreToolUse` checkpoints remain available internally but do not appear as list entries.

## Prompt Boundaries

Every `UserPromptSubmit` hook creates a metadata commit even when file contents have not changed. That commit is the workspace state immediately before the prompt runs.

For each ordinary prompt, its restore impact is calculated from that baseline to the current working tree. This is intentionally cumulative: entry `4` shows what would change if the user went back four prompts, not only what the fourth prompt changed by itself. Entries with no net file changes are omitted. The newest 50 meaningful entries are displayed.

Administrative `$rewindex` prompt commits still close the preceding prompt's state but are excluded from numbering, so invoking `list` or `diff` does not shift visible numbers.

## Restore Semantics

Restoring a prompt baseline makes all captured files match that baseline:

- Modified files are restored.
- Files deleted since the baseline are recreated.
- Files created since the baseline are deleted.

Only paths known to rewindex snapshots are touched. Excluded and oversized paths remain untouched. A safety snapshot is created first, so `$rewindex undo` restores the pre-restore workspace.

## Compatibility

Existing hash IDs remain valid. Older snapshots without reliable prompt-boundary commits remain directly addressable by hash but are not invented as numbered prompt entries.

## Testing

Add an end-to-end non-Git scenario with four prompts that modify, create, and delete files. Verify numbered list output, the 50-entry cap, number/hash resolution, cumulative diff, full restore including removal of later-created files, and undo. Preserve the existing project-Git isolation and Unicode filename checks.
