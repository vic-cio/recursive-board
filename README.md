# Recursive Board

Recursive Board turns a folder of Markdown files in an Obsidian vault into a hierarchical work board. Each work item is one Markdown file, and its parent link defines where it belongs. **Markdown is canonical. The plugin is a view, never the database.** The plugin renders and edits work items in Obsidian. Agents and scripts run commands through the Obsidian CLI, or through the standalone `wi` CLI on a machine with no Obsidian. All of them use the same schema and rules. Recursive Board works with local vaults and with vaults that Obsidian Sync or another sync client synchronizes.

Recursive Board is at an early stage. Commands and behaviour can still change between releases. To report a problem, open an issue at [https://github.com/vic-cio/recursive-board/issues](https://github.com/vic-cio/recursive-board/issues).

> **Install with your agent.** Paste this prompt into your coding agent: "Install the Recursive Board plugin in my Obsidian vault. Ask me which vault. Tell me to open Settings → Community plugins → Browse in Obsidian, find Recursive Board, select Install, then enable it. If I cannot use Browse, download `main.js`, `manifest.json` and `styles.css` from [https://github.com/vic-cio/recursive-board/releases/latest](https://github.com/vic-cio/recursive-board/releases/latest) into the vault's `.obsidian/plugins/recursive-board/` folder, and tell me to enable Recursive Board in Settings → Community plugins. On a headless machine with no Obsidian app, or for scripts, install the `wi` CLI instead: check that Node.js 20.12 or later is installed, run `npm install --global recursive-board`, then run `wi setup`."
>
> To install without an agent, see [Install the plugin](#install-the-plugin). For headless use and scripts, see [The standalone `wi`](#the-standalone-wi).

## Install the plugin

Open **Settings → Community plugins → Browse**, find **Recursive Board**, select **Install**, then enable it.

To install it manually, use the GitHub release:

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/vic-cio/recursive-board/releases/latest).
2. Create the folder `.obsidian/plugins/recursive-board/` in the vault.
3. Copy the three files into it.
4. In Obsidian, open **Settings → Community plugins** and enable **Recursive Board**.

To build from source instead, run `npm run build` and copy the same three files from `dist/`.

Reload Obsidian after replacing plugin files. If your vault syncs its `.obsidian` folder, the sync client can copy the installed plugin to your other devices. Sync behavior depends on that client's settings.

## Start a board

Enable Recursive Board in an empty vault. Use the **Create your first board** button in the notice, or run **Create your first board** from the command palette. Enter a name. The default is `Main`. The plugin creates the board and a starter card. It sets `defaultRoot` in the board settings, then opens the board. To make a board by hand, see [Start a board by hand](https://github.com/vic-cio/recursive-board/blob/main/docs/work-items.md#start-a-board-by-hand).

Each work item is a Markdown file in the work-item folder, `Boards/` by default. Its frontmatter has these core fields:

- `type` is `work-item`, and `id` is a stable, unique id such as `wi-k7m3`. `title` is the title.
- `status` is `backlog`, `options`, `doing` or `done`. A root item has no `status`.
- `parent` is a wikilink to the parent item. A root item has no `parent`.
- `created` and `updated` are dates in `YYYY-MM-DD` form.
- `board: true` shows the children in status columns. Without it, they show as a checklist.
- `prev_status` keeps the status before `done`. `area: true` marks an ongoing area.

The optional fields are `assignee`, `priority`, `due`, `depends_on`, `tags` and `archived`. The plugin and `wi` keep every frontmatter key they do not know. [Work items](https://github.com/vic-cio/recursive-board/blob/main/docs/work-items.md) describes each field, areas, and how to find and open a card.

Set the board settings in **Settings → Recursive Board → Board**: the card folder, the default parent, the extra sections and first-child promotion. The agent limit is under **Dispatcher**. [Vault configuration](https://github.com/vic-cio/recursive-board/blob/main/docs/configuration.md) describes each setting.

## Run commands through the Obsidian CLI

The Obsidian CLI is the official way to run commands. On a desktop, an agent or a script runs every `wi` command line through the plugin, with no Node. A person does one step: turn on **Settings → General → Advanced → Command line interface** in Obsidian. The call also needs these:

- Obsidian must be running. If it is not, the CLI exits with 'The CLI is unable to find Obsidian...', and an agent falls back to `wi` or asks for input.
- The Obsidian installer must be 1.12.7 or later, from [obsidian.md/download](https://obsidian.md/download). An older one prints a warning line before every reply and hangs when Obsidian is closed.
- The call is on a desktop. The phone has no Obsidian CLI.

```sh
obsidian vault=<name> recursive-board cmd="status wi-1 done" agent=<name> model=<model>
```

- Pass `vault=<name>` as the first argument of every call, so the command cannot reach the vault that has focus.
- The reply succeeded only when its first line is exactly `ok`. Any other first line is a failure, and the exit code is always 0.
- Put the whole command line, flags included, in `cmd`. Obsidian drops an argument that starts with `--`. Quote a title with an apostrophe as `cmd="new \"Ana's card\" --parent wi-1"`.
- `agent=` and `model=` sign a claim or a note, as `WI_AGENT` and `WI_MODEL` do. `cmd=help` prints the `wi --help` text.

These are the commands for daily work. They read a board and a card, add a card, claim it, add a signed note, move it to done, and check the vault:

```sh
obsidian vault=<name> recursive-board cmd="children wi-1 --tree"
obsidian vault=<name> recursive-board cmd="show wi-2 --json"
obsidian vault=<name> recursive-board cmd='new "Write the first card" --parent wi-1 --objective "Ship it" --criteria "It ships"'
obsidian vault=<name> recursive-board cmd="claim wi-2" agent=<name> model=<model>
obsidian vault=<name> recursive-board cmd='note wi-2 "Drafted the plan"' agent=<name> model=<model>
obsidian vault=<name> recursive-board cmd="status wi-2 done"
obsidian vault=<name> recursive-board cmd="validate"
```

`cmd=setup` prints the agent skill's text and where to save it. [Commands](https://github.com/vic-cio/recursive-board/blob/main/docs/commands.md) lists every command and flag.

## Ask a person to review a card

A review is a wait on a person. It uses the same `depends_on` field and the same commands as a wait on another card.

- **Ask.** Choose **Waits on…** in the card's menu and pick a person, or run `wi depend <ref> --on <person>`. The person is a note with `type: person`. The command adds a link to that note in `depends_on`, next to any card links, and writes no note.
- **Send back.** The person removes the wait: **Stop waiting on `<name>`** in the menu, one item for each wait, or `wi depend <ref> --on <person> --off`. The card stays in doing with its assignee.
- **Approve.** The person moves the card to done: tick it, or run `wi status <ref> done`. Moving a card to done removes its waits on people. A person who moves a card to done approves it, whether or not they meant to.

While a card waits on a person, `wi claim` and `wi status <ref> doing` refuse it, and `wi agents` does not count its assignee. Say what to check on the card, in its Notes, or send it by mail or message: `wi` writes no review request.

The core plugin shows a wait on a person as an hourglass badge on the card, and as **Stop waiting on `<name>`** in the card menu. It ships no list of the cards that wait on a person. A custom dashboard can build that list from `waits_on_people` in `wi children --json` and `personDependencies` in `wi show --json`.

## Assign a card

`wi assign <ref> --to <person>` adds a person to the card's assignees. The person needs a note with `type: person`. `wi assign <ref> --to agent` asks any agent to take the card, and the agent's `wi claim` puts its own name in place of `agent`. `wi assign <ref> --to <name> --off` removes one assignee. Assigning changes nothing else: the status stays, and no note is written. In the plugin, **Assign to…** and **Unassign** in the card menu do the same. [Assign a card](https://github.com/vic-cio/recursive-board/blob/main/docs/commands.md#assign-a-card) has the details, and how agents claim and release cards.

## The standalone `wi`

Use the standalone `wi` on a machine with no Obsidian app, such as a server, or in a script that runs while Obsidian is closed. It needs Node.js 20.12 or later:

```sh
npm install --global recursive-board
wi setup
```

`wi setup` installs the agent skill and saves the default vault. It writes nothing into the vault. `wi doctor` checks the install and the vault. `wi update --dry-run` shows what an update changes, and `wi update` does it. [Install and update `wi`](https://github.com/vic-cio/recursive-board/blob/main/docs/commands.md#install-and-update-wi) has the details.

## Version the vault with Git (optional)

Git is optional. If your vault is a Git repository, a pre-commit hook can run `wi validate` and stop a commit when the vault has errors. [Version the vault with Git](https://github.com/vic-cio/recursive-board/blob/main/docs/git-hook.md) gives the hook snippet and the setup steps. `wi doctor` reports whether a pre-commit hook runs validation.

## Development

Requirements: Node.js 23.6 or later and npm.

```sh
npm install
npm test
npm run build
```

`npm test` typechecks the CLI and plugin, then runs the test suite. `npm run build` builds the plugin and CLI. [Development](https://github.com/vic-cio/recursive-board/blob/main/docs/development.md) describes the test fixtures.

## Decisions

See [`docs/adr/`](https://github.com/vic-cio/recursive-board/tree/main/docs/adr) for the project's decision record.

## License

MIT. See [LICENSE](https://github.com/vic-cio/recursive-board/blob/main/LICENSE).
