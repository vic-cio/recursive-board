---
status: accepted
---
# `wi setup` installs the agent skill and records a default vault

The npm package includes the Recursive Board agent skill. `wi setup` copies it to both the
Claude Code and `.agents` skill locations, discovers vaults from Obsidian's registry, and writes
the selected absolute path to `config.json` under the user's config directory. The config path
respects `XDG_CONFIG_HOME` and otherwise uses `~/.config/wi/config.json`.

An existing skill directory is replaced only when it carries the marker written by setup, or
when the user passes `--force`. Symlinked development installs are left alone. The Git validation
hook is offered interactively for a Git vault; unattended setup does not prompt or install it.

Agents can run `wi setup --yes --vault <path>` to perform setup without interaction. Setup does
not edit work item files; the interactive hook offer may write the Git pre-commit hook.

## Considered options

Asking the agent to copy a remote skill and request a vault path makes installation brittle and
requires paths to be typed. Packaging the skill and reading Obsidian's registry makes the setup
repeatable while keeping the vault selection visible to the user.
