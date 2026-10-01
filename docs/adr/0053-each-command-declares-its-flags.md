---
status: accepted
---
# Each command declares its flags

`src/cli/flags.ts` lists the flags each `wi` command takes. `wi` finds the command, then parses the arguments against that list alone. A flag outside the list stops the command with exit code 2. The message names the flag and the command, and names the commands that take the flag when there are three or fewer.

Before this, one schema served every command. A command ignored a known flag it did not use, so `wi archive <ref> --dry-run` archived the card. Guards in `wi.ts` covered some flags and missed others.

Every command takes `--help` and `--version`. The retired `wi objective` stub takes no command-specific flags. Other commands declare their supported flags in `src/cli/flags.ts`.

`wi archive` has no dry run. An archive changes one flag and `wi archive <ref> --undo` reverses it, so `--dry-run` is refused.
