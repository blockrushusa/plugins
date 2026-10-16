# pstack harness trees

This folder is generated from `pstack/skills`, `pstack/agents`, `pstack/docs`, `pstack/README.md`, and `pstack/plugin.json`. Do not edit it by hand.

Cursor uses `pstack/` directly. Claude Code installs `claude-code/`, and Codex installs `codex/`. A relative link to a pstack file that the trees leave out points at that file on GitHub `main` instead.

After editing those sources, run `node scripts/generate-pstack-harness-trees.mjs` from the repository root and commit the result.
