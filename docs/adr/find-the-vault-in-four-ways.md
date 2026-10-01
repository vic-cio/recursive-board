---
status: accepted
supersedes: 0026-repo-board-pointers.md
---
# Find the vault in four ways

`wi` finds the vault from four sources, in this order:

1. `--vault <path>`.
2. `$WI_VAULT`.
3. The vault that the current folder is in: the nearest folder above it that holds the plugin data file or `Boards/`.
4. `defaultVault` in `wi/config.json`, which `wi setup` writes.

The repository pointer is removed. Six sources were too many to keep in mind, and the one user keeps a project's board in that project's `AGENTS.md`. `wi` no longer reads `wi/repos.json`. A file that is left there does nothing.

`wi here` stays as a command that exits 0, changes nothing, and says that a project's `AGENTS.md` names its board. It keeps its old flags, so an old script still runs. Without `--parent`, `wi new` uses `defaultRoot` from the board settings, or refuses. `wi children` needs a `<ref>`.

## Considered options

Keeping the pointer as a fifth source would keep a second place that names a project's board. That place is invisible in the repository, and it can disagree with `AGENTS.md`. A project that needs a board names it in `AGENTS.md`, and an agent passes it as `--parent`.
