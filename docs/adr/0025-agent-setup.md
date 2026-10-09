---
status: accepted
amended_by: 0069-setup-prints-the-recommended-setup.md (setup ends with the recommended agent setup and gains --json), 0075-git-versioning-is-advice.md (setup offers no hook), 0081-the-docs-explain-the-tools-and-ship-no-agent-playbook.md (setup prints no recommended setup)
---
# `wi setup` installs the agent skill and records a default vault

The npm package includes the Recursive Board agent skill. `wi setup` copies it to both the
Claude Code and `.agents` skill locations, discovers vaults from Obsidian's registry, and writes
the selected absolute path to `config.json` under the user's config directory. The config path
respects `XDG_CONFIG_HOME` and otherwise uses `~/.config/wi/config.json`.

An existing skill directory is replaced only when it carries the marker written by setup, or
when the user passes `--force`. Symlinked development installs are left alone. Setup offers no
Git validation hook (amended by 0075).

Agents can run `wi setup --yes --vault <path>` to perform setup without interaction. Setup does
not edit work item files.

Setup ends by printing the optional recommended agent setup from the playbook, with `--yes` too.
It writes nothing into the vault for it (amended by 0069). `--json` prints one object and asks no
questions, so it needs `--vault`, as `--yes` does.

## Considered options

Asking the agent to copy a remote skill and request a vault path makes installation brittle and
requires paths to be typed. Packaging the skill and reading Obsidian's registry makes the setup
repeatable while keeping the vault selection visible to the user.
