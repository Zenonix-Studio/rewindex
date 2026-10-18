# English README Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore the public README and make every line in it English.

**Architecture:** This is a documentation-only change. Use the tracked `origin/main` README as the source of truth, replace only its Turkish prompt-history example with English text, and verify both content recovery and language consistency.

**Tech Stack:** Markdown, ripgrep, existing Node.js project checks

---

### Task 1: Restore and translate README

**Files:**
- Modify: `README.md`

**Step 1: Verify the current README is broken**

Run: `rg -n '^# rewindex$|^## Install$' README.md`

Expected: FAIL because the local file contains only the intentional `bozuldu` test text.

**Step 2: Restore the README and translate the example**

Use `origin/main:README.md` as the base. Replace its example with:

```text
1. dcdf6bb9f1                                      3 min ago
                              1 modified · 0 added · 0 deleted
   Prompt: Update the README with the new installation steps.
   Summary: README.md returns to its previous state.
```

Do not change product claims, commands, configuration, limits, or licensing text.

**Step 3: Verify the README is complete and English-only**

Run: `rg -n '^# rewindex$|^## Install$|^## License$' README.md`

Expected: all three headings are present.

Run: `rg -n '[ÇĞİÖŞÜçğıöşü]|\b(?:önce|değişen|eklenen|silinen|dosyasını|Özet|haline|döner)\b' README.md`

Expected: no matches.

**Step 4: Run project verification**

Run: `npm run build && npm run selfcheck && npm run edgecheck && npm run installcheck && npm run historycheck`

Expected: all checks pass.

**Step 5: Commit and push**

```bash
git add README.md
git commit -m "docs: make README fully English"
git push -u origin docs/english-readme
```
