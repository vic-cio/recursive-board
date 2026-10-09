---
status: accepted
amended_by: 0080-the-plugin-serves-setup-doctor-and-update-and-writes-nothing.md (the handler serves every command)
---
# One plugin CLI handler, with a fixed first reply line

An agent on a desktop should work the board with no Node install. Obsidian 1.12.2 added the
`obsidian` CLI, and a plugin adds commands to it with `registerCliHandler`. The spike (wi-hopw)
found three limits. The CLI exits 0 whatever a handler returns or throws. Obsidian drops every
argument that starts with `--`. A command queued at start-up can run before the vault is read.

## The decision

- **One handler, `recursive-board`, in `src/plugin/cli-handler.ts`.** The call is
  `obsidian vault=<name> recursive-board cmd="<wi command line>"`. The whole `wi` command line,
  flags included, travels in `cmd`. The handler splits it with `splitCommandLine` and parses it
  with `parseCommandLine` (0077), then runs it with `runCommand` on the Obsidian port (0076). So
  one syntax serves both, and a new command in `RUNNERS` is served with no handler change.
- **The first reply line is exactly `ok` when the command succeeded, else `error: <reason>`.**
  The exit code carries nothing, so this line is the only status. A wi exit other than 0 is an
  error line, exit 1 included: `wi validate` on an invalid vault replies
  `error: wi validate exited 1`. The reason is the last line `wi` wrote to standard error, with
  its `wi: ` prefix removed. A parse refusal, an unclosed quote and a missing `cmd` are error
  lines too. The handler never throws.
- **Standard output follows the first line unchanged, then standard error.** A warning such as
  `wi: warning: wi-1 has no objective` keeps its `wi:` prefix, so a reader tells it from the
  output. This is the order a shell that merges the two streams shows for `wi`. On an error, the
  reason line leaves standard error, and the rest follows standard output.
- **`agent=<name>` and `model=<name>` are handler parameters.** The plugin has no process
  environment, so the handler gives them to the runner as `WI_AGENT` and `WI_MODEL`, and a claim
  or a note signs as it does in `wi`. A parameter with no value is an error line.
- **`cmd=help`, `cmd="--help"` and `--help` after any command reply `ok`, then `renderHelp()`,**
  the same text as `wi --help`. `--version` replies the plugin version and its rules version, as `wi --version` does.
- **The handler serves every command in the command table.** It runs `RUNNERS` and the plugin's
  own `setup`, `doctor` and `update`
  ([0080](0080-the-plugin-serves-setup-doctor-and-update-and-writes-nothing.md)). A name that is
  not in the table replies `error: unknown command "<name>". Run cmd=help.`
- **`--vault` in `cmd` is refused.** The vault is the one `obsidian` opened, chosen by
  `vault=<name>`. A `--vault` that the handler ignored would look as if it worked, on the wrong
  vault.
- **A command waits for the layout and the metadata cache.** The first call waits until the
  layout is ready and then for the metadata cache's first `resolved` event, at most two seconds.
  A plugin turned on after start-up may have missed that event, so the wait has a limit.
- **The handler registers on the desktop app only, and only when `registerCliHandler` exists.**
  The phone has no CLI.

## What agents are told

The skill, the playbook and the README say: on a desktop an agent may use the plugin CLI; a reply
succeeded only when its first line is exactly `ok`; every call passes `vault=<name>` as the first
argument, because without it the CLI picks the vault of the working folder or the one in focus;
the Obsidian installer must be 1.12.7 or later, because an older one prints a warning line before
every reply and hangs when Obsidian is closed. A title with an apostrophe goes in double quotes
inside single quotes: `cmd='new "Ana'\''s card" --parent wi-1'`, or in escaped double quotes:
`cmd="new \"Ana's card\" --parent wi-1"`.

## Rejected

- **One handler per command** (`recursive-board:new`, `recursive-board:status`). Each needs its
  own flags in Obsidian's `key=value` form, and agents would learn a second syntax.
- **Throw to signal a failure.** Obsidian turns it into `Error: <message>` and still exits 0, and
  its own refusals (`Command ... not found`, `Vault not found.`) look the same. Only a fixed
  success line tells them apart.
- **Put standard error before the output, or drop it.** Before, the output no longer starts on
  the second line. Dropped, an agent loses the warnings `wi` gives it.
