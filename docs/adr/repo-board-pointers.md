---
status: accepted
---
# Resolve a repository's board through user config

`wi` can be run from a code repository without a vault flag. `wi here --vault <path> --board <ref>` stores the association in `wi/repos.json` under the absolute Git common directory. That keeps vault paths out of the repository and makes linked worktrees share one pointer. The location follows `XDG_CONFIG_HOME`, falling back to `~/.config/wi/`.

Vault lookup still gives explicit choices precedence: `--vault`, `WI_VAULT`, the nearest vault, the repository pointer, and then `defaultVault` in `wi/config.json`. The repository board supplies the default parent for `wi new` and the default reference for `wi children` only when the selected vault matches the pointer.

## Considered options

Writing a vault marker into each repository would put personal vault paths into source trees and would not naturally share settings across worktrees. Keying a user-level map by the Git common directory avoids both problems. A single default vault remains useful for projects that do not need a per-repository board.
