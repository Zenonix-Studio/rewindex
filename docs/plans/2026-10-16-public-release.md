# Public Release Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish rewindex as a tested MIT-licensed public GitHub repository and npm package.

**Architecture:** Prepare release metadata and documentation on the existing feature branch, verify the repository and packed artifact, merge to `main`, create and push the GitHub repository, then publish the exact committed package from a clean temporary export.

**Tech Stack:** Node.js, npm, Git, GitHub CLI

---

### Task 1: Prepare public release files

**Files:**
- Create: `LICENSE`
- Modify: `package.json`
- Modify: `README.md`

1. Add the MIT license for Zenonix Studio.
2. Add GitHub repository, homepage, bugs, and public publish metadata.
3. Update README examples for `$rewindex list`, numbered selectors, and installed skill usage.
4. Preserve the user's dirty README content after committing the release version.
5. Commit the release files.

### Task 2: Verify repository and package

**Files:** No expected changes.

1. Run build, selfcheck, edgecheck, installcheck, and historycheck.
2. Run `git diff --check` and scan tracked files for credential patterns.
3. Run `npm pack --dry-run --json` from a clean export and inspect the file list.
4. Confirm `rewindex` remains available on npm and the GitHub repo remains absent.

### Task 3: Publish GitHub repository

**Files:** No expected changes.

1. Merge `feat/prompt-history` into local `main`.
2. Create `zenonix-studio/rewindex` as a public GitHub repository.
3. Push `main` and verify visibility, default branch, license, and commit SHA.

### Task 4: Publish npm package

**Files:** No expected changes.

1. Authenticate with npm without exposing credentials.
2. Publish `rewindex@0.1.0` from a clean export with public access.
3. Verify registry metadata and test `npx rewindex --help` from a temporary directory.
