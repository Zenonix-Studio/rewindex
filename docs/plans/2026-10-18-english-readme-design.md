# English README Design

## Goal

Keep the public README entirely in English without changing rewindex behavior or product claims.

## Scope

- Restore `README.md` from the current `origin/main` content because the local file contains the intentional `bozuldu` test edit.
- Translate the Turkish prompt-history example, including relative time, change counts, prompt text, and summary.
- Leave runtime CLI localization, historical plans, and Unicode test fixtures unchanged.

## Verification

- Search `README.md` for Turkish-specific characters and the Turkish phrases currently present in the example.
- Review the Markdown diff and run the existing automated checks to ensure the documentation-only change did not disturb the package.
