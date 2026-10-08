---
status: accepted
amended_by: 0075-git-versioning-is-advice.md (the hook check reads the pre-commit file)
---
# wi doctor checks the install and the agent setup, on request

A user needs one place that says whether `wi` works on this machine, and how their vault compares
with the optional playbook (0067). `wi validate` checks the structure of the vault. It never
reports a skipped recommendation, because no workflow is forced (AGENTS.md, "No forced workflow").
So the checks of the recommendations need a command of their own, and the user must ask for it.

## The decision

`wi doctor [--json]` runs each check and prints one line per check: `pass`, `note` or `fix`. A fix
prints the command to run or the text to paste. The texts to paste come from the playbook's marked
blocks in the installed package, so the advice changes with the playbook.

- **On request only.** No other command runs the checks, and nothing runs them in the background.
- **No stored state.** Each run reads the package, the home folder and the vault again. It keeps
  no record of an earlier run and no list of skipped advice.
- **It writes nothing.** A test takes every file of the vault and the home folder, with its bytes
  and its modification time, before and after a run, and compares them.
- **The vault.** `wi doctor` finds the vault in the same order as every other command (0059). With
  no vault, only the install checks and the skill check run.

### Install checks

| Id | Checks |
|---|---|
| `node` | The running Node meets `engines.node` in the package. |
| `package` | The package has `docs/playbook.md` and the skill. |
| `wi-version` | `wi` is the newest version on the npm registry. |
| `vault` | `wi` finds a vault, and the folder is a vault. |
| `plugin-version` | The vault's `.obsidian/plugins/recursive-board/manifest.json` has the version of `wi`. |
| `board-settings` | The plugin data holds the board settings (0060). |
| `hook` | Whether the Git pre-commit hook runs validation (0075). It only reads the file. The hook is optional, so this check is never a fix. |
| `validate` | A one-line `wi validate` summary. |

The registry lookup has a 3-second timeout and honours `npm_config_registry`. When the registry does
not answer, the check is a note, not a fix. The tests inject the lookup and never use the network.

### Agent setup checks

There is one check for each id in the playbook's `checks` block, in its order. A check id that this
`wi` does not know is a note that asks for a newer `wi`. The check logic is in `src/shared/doctor.ts`
as pure functions, and `src/cli/commands/doctor.ts` reads the vault for them.

`background-wait` finds a role or procedure note with a line that tells a worker to wait in a
background task. That was the old Dispatching step, and a headless worker that follows it ends
before its children finish. The fix prints the current step from the playbook.

### Exit code

`wi doctor` exits 0 unless the install is broken. The install is broken when a `wi` command cannot
run:

- Node is older than the package needs.
- The package has no playbook or no skill.
- The vault that `--vault`, `WI_VAULT` or `defaultVault` names does not exist, or is not a vault.
- The plugin data file cannot be read, so each command that reads the vault fails.

Each other finding is a note or a fix, and the exit code stays 0. An old `wi`, a missing hook, a
vault with validation errors, and each agent setup finding do not stop `wi` from working.

## No plugin command

`wi doctor` has no plugin command. A user does not expect to check plugin health in Obsidian, and
the install checks need the terminal: Node, the npm registry and the skill folders. This is an
exception to the rule that each command has a plugin feature (AGENTS.md, "Working here").

## Rejected

- **`wi info`, a command that remembers which advice the user skipped.** It needs stored state,
  and a stored list of skipped advice is a workflow in itself.
- **Report skipped recommendations in `wi validate`.** That makes the playbook look required, and
  the pre-commit hook would then stop commits for a choice.
- **Exit 1 for each fix.** A script that runs `wi doctor` would then fail for an optional
  recommendation.
- **Fix the findings with a flag.** The user reads the text and pastes it. A write into the vault
  would make the playbook a workflow that `wi` applies.
