# Public Release Design

## Goal

Release rewindex as an MIT-licensed public project at `zenonix-studio/rewindex` and as the unscoped npm package `rewindex`.

## Release shape

- GitHub: public repository, default branch `main`.
- npm: `rewindex@0.1.0`, with the `rewindex` executable.
- License: MIT, copyright 2026 Zenonix Studio.
- Documentation: installation, Codex `$rewindex` workflow, numbered restore selectors, security caveat, and limitations.
- Package metadata: repository, homepage, bugs URL, license, Node requirement, and public access.

## Safety

- Run every automated check and inspect `npm pack --dry-run` before publishing.
- Search tracked files and package contents for likely credentials.
- Publish from committed `main`, not from the dirty working tree.
- Preserve the existing uncommitted `README.md` test artifact in the local working tree.
- Never print npm or GitHub credentials.

## External actions

Creating a public GitHub repository, pushing code, and publishing to npm are intentionally public and were explicitly authorized by the user.
