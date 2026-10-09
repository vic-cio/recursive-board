---
status: accepted
amends: 0069-setup-prints-the-recommended-setup.md (the plugin CLI's setup prints the summary to an agent), 0076-a-storage-port-and-a-command-runner.md (the coverage test reads the command table), 0078-one-plugin-cli-handler.md (the handler serves every command)
amended_by: 0081-the-docs-explain-the-tools-and-ship-no-agent-playbook.md (the plugin bundles the skill only)
---
# The plugin serves setup, doctor and update, and writes nothing

An agent on a desktop with no Node works the board through the plugin CLI (0078). It still needs
the skill, a way to check the vault, and a way to know which version it runs. `wi setup`,
`wi doctor` and `wi update` do that work on the machine: they copy the skill, write the wi config,
run npm and check Node. The plugin has no Node, and writes nothing outside the vault.

## The decision

- **Every command in the command table exists on both entry points.** The handler serves
  `RUNNERS` and `PLUGIN_RUNNERS` in `src/plugin/install-commands.ts`. `wi` keeps its own
  `setup`, `doctor` and `update`, with the same behaviour and output as before.
- **On the plugin, setup, doctor and update write nothing.** `--json` gives one object for each.
  `--yes`, `--force`, `--dry-run` and `--from` change nothing, because there is nothing to ask,
  replace or install.
- **`setup` prints** what the plugin CLI needs (the installer 1.12.7 or later, the command line
  interface setting, `vault=<name>` first, the first line rule), the two paths where an agent
  saves the skill, the playbook's `summary` block with the playbook's address on GitHub for the
  plugin's version, and then the whole skill. The agent saves the skill itself. Victor chose this
  on 2026-10-09 (grill q11, card wi-m51e folded into wi-xh36), so that a user with no Node gets
  the skill.
- **The plugin carries the skill and the playbook.** `build/bundled-texts.mjs` writes them into
  `src/plugin/bundled-texts.ts` before each plugin build, and a test fails when that module and
  `skills/recursive-board/SKILL.md` or `docs/playbook.md` differ. Run
  `node build/bundled-texts.mjs` after you edit either file.
- **doctor has one check list, each check marked vault or install.** `DOCTOR_CHECKS` and
  `checkScope` in `src/shared/doctor.ts` mark them; the playbook's `checks` block names the agent
  setup checks, and of those only `skill` is an install check. The vault checks that read files
  (`board-settings`, `validate` and the agent setup notes) are in `src/shared/doctor-vault.ts`
  and read through the port, so `wi doctor` and the plugin read the vault the same way. The plugin
  runs the vault checks, `rules` included, and lists the install checks it skipped under
  "Skipped install checks: run wi doctor where Node is installed". It exits 1, so the reply is an
  error line, only when the plugin data cannot be read.
- **The plugin does not check the installer version.** The Obsidian API gives the app version, not
  the installer version. doctor and setup state the need and say where to read the version.
- **`update` prints** the plugin version and its rules version, and says to update from Settings,
  Community plugins, then to run `cmd=setup` for the new skill.
- **The install commands read no rules marker.** `runCommand` warns about a newer marker only for a
  vault command that writes, so the plugin's setup and update give no write warning.
- **The contract test covers every command but the install commands.** Its coverage test reads
  `COMMANDS` and fails when a vault or retired command has no case on both ports. The install
  commands differ on the two sides on purpose, so each side tests its own, and the handler test
  checks that the plugin serves every command in the table.

## Rejected

- **Write the skill from the plugin into `~/.claude/skills`.** The plugin would write outside the
  vault, and on the phone there is no such folder. The agent can save a printed text.
- **Read the bundled texts from the vault.** The playbook and the skill are not in the vault, and
  putting them there adds files that only the tools read.
- **Guess the installer version from the user agent string.** It is not a documented API, and a
  wrong guess would report a false fix.
