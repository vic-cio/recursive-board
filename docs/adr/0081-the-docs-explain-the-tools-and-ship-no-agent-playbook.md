---
status: accepted
supersedes: 0067-the-playbook-ships-with-marked-blocks.md, 0069-setup-prints-the-recommended-setup.md
amends: 0070-wi-doctor-checks-on-request.md (doctor checks the install and the vault, and no agent setup), 0075-git-versioning-is-advice.md (the README holds the Git advice), 0078-one-plugin-cli-handler.md (the plugin CLI needs are for agents only), 0080-the-plugin-serves-setup-doctor-and-update-and-writes-nothing.md (the plugin bundles the skill only)
---
# The docs explain the tools and ship no agent playbook

Recursive Board is a productivity tool first. It also suits agent orchestration, but each user's
agent setup (harness, permission mode, sandbox, roles, dispatch) is theirs (AGENTS.md, "No forced
workflow"). The agent playbook (0067) described one such setup that worked, and `wi setup`,
`wi doctor` and the plugin's `cmd=setup` (0069, 0070, 0080) printed it, checked a vault against it
and bundled it. A shipped recommendation looks like a default, and 26 files then had to keep it in
step with the code.

Decided by Victor on 2026-10-09: scrap the playbook, and keep only explainers for the tools.

## The decision

- **No playbook ships.** `docs/playbook.md` and the parser of its marked blocks
  (`src/shared/playbook.ts`) are deleted. `package.json` `files` lists no playbook. The docs that
  remain explain the tools: the README, the skill (which teaches an agent to use `wi`), `wi --help`
  and the ADRs. None of them recommends how to run agents.
- **`wi setup` copies the skill and saves the default vault, and prints no recommended setup.**
  `--json` prints `vault`, `config` and `skills`, and no `recommendedSetup`. `--yes` and the
  vault choice are unchanged.
- **`wi doctor` checks the install and the vault.** The agent setup checks are removed:
  `agents-md`, `dispatching-note`, `role-notes`, `person-note`, `max-agents`, `background-wait`
  and `agent-count`. The `skill` check stays, and is now the last check of the Install section,
  because the skill is a tool that `wi setup` installs. A vault with no `AGENTS.md` and no `Roles/`
  folder passes every check. The `package` check needs the skill only. The exit code rule is
  unchanged.
- **The plugin's `cmd=setup` prints what the plugin CLI needs, the skill paths and the skill text.**
  It prints no summary and no playbook address. `cmd=doctor` runs the vault checks and lists the
  install checks it skipped. The plugin bundles the skill only (`build/bundled-texts.mjs`).
- **`wi update` prints the changelog's Agent setup changes and suggests nothing.** The changelog's
  "Agent setup" section stays for a release that changes what the skill tells agents. The `suggest`
  field of the `changes` step in `wi update --json` is removed, because it told the user to compare
  the vault with the playbook.
- **The README holds the Git advice.** The pre-commit snippet, the setup steps and the points that
  make a hook fail move from the playbook to the README's "Version the vault with Git" section. The
  hook snippet test reads the README. `wi doctor` still reports the hook, as a note and never a
  fix, and points at the README.
- **The plugin CLI needs are for agents only.** Victor, 2026-10-10: the Obsidian installer 1.12.7,
  the Command line interface setting and a running desktop Obsidian matter only to an agent that
  works the board through the plugin CLI (0078). They leave the install prompt and the install
  steps, and sit under the README's agent part. The one step a person does is turning on
  **Settings → General → Advanced → Command line interface**.
- **The decision records stay.** 0067 and 0069 keep their text and are marked superseded. They
  explain why the playbook existed.
- **`docs/refocus-hook.md` leaves the repo with the playbook.** It is agent setup advice for one
  harness, not product documentation. The hook and its settings do not change.

## Rejected

- **Keep the playbook in the repo only, off the package.** The repo would still carry a
  recommendation that the code no longer reads, and the docs would drift from it.
- **Keep the doctor's agent setup checks without the playbook.** The checks compare a vault with
  one workflow. Without the playbook they would hard-code that workflow.
- **Keep `wi update`'s `suggest` field with `wi doctor`.** The advice to compare a vault with the
  playbook is gone, and a field that points at a command that checks the install would be noise.
