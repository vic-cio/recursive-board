---
status: superseded
superseded_by: 0081-the-docs-explain-the-tools-and-ship-no-agent-playbook.md
amends: docs/adr/0025-agent-setup.md (setup ends with the recommended agent setup and gains --json)
amended_by: 0075-git-versioning-is-advice.md (setup offers no hook), 0080-the-plugin-serves-setup-doctor-and-update-and-writes-nothing.md (the plugin CLI's setup prints the summary to an agent)
---
# `wi setup` prints the recommended setup and writes no workflow file

The playbook (0067) describes one agent setup that works. A new user installs with npm and sees
the README only later, so `wi setup` is the first place that can tell them the setup exists. The
setup is optional (AGENTS.md, "No forced workflow"), so setup only shows it.

## The decision

- After the vault choice and the skill copies, `wi setup` prints the playbook's
  `summary` block as plain text, like `--help` output. Below it, setup prints the path of the
  installed `docs/playbook.md` and names `wi doctor` as the way to check a vault against it.
- Setup copies no role note, writes no `AGENTS.md` and asks no question about the setup. It stores
  no "seen" state. Each run prints the summary again.
- `--yes` prints the same text. It asks no questions, and printing is not a question. An agent
  that runs `wi setup --yes --vault <path>` reads the summary and shows it to the user, as the
  README's install prompt and the skill's Setup section tell it.
- `wi setup --json` prints one object: `vault`, `config`, `skills` (each path and its outcome) and
  `recommendedSetup` (`summary`, `playbook` path and `check` command). It asks no questions, so it
  needs `--vault`, as `--yes` does. `recommendedSetup` is null when the playbook or its block is
  missing.
- When the installed playbook or its `summary` block is missing, the text output leaves the summary
  out. A missing optional text does not stop the setup.
- The plugin shows nothing of it. Victor, 2026-10-04: the recommended setup is CLI tooling that
  helps agents configure a user's workspace, and a document that people find in the repo on
  GitHub. It is not a feature for people in Obsidian. `playbookPasteBlocks` in
  `src/shared/playbook.ts` lists the paste-ready blocks for `wi`.

## Rejected

- **Copy the role notes and an `AGENTS.md` section into the vault on a yes.** It writes a workflow
  into the user's vault, and the user must then own files they did not write. Text to paste leaves
  the choice and the wording with the user.
- **Record the playbook version as seen, and show only newer changes later.** It needs stored
  state for a text that costs nothing to print again. `wi doctor` compares a vault on request.
- **Leave the summary out of `--yes`.** Agents run setup with `--yes`, so the user would never
  see it.
- **Open the window by itself on the first board.** A link in the notice offers the setup without
  pushing it.

Decided by Victor on 2026-10-04: setup prints the recommended setup as text to paste and copies
no file.
