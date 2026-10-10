# Recursive Board

> **Install with your agent.** Paste this prompt into your coding agent: "Install the Recursive Board plugin in my Obsidian vault. Ask me which vault. Tell me to open Settings → Community plugins → Browse in Obsidian, find Recursive Board, select Install, then enable it. If I cannot use Browse, download `main.js`, `manifest.json` and `styles.css` from https://github.com/vic-cio/recursive-board/releases/latest into the vault's `.obsidian/plugins/recursive-board/` folder, and tell me to enable Recursive Board in Settings → Community plugins. On a headless machine with no Obsidian app, or for scripts, install the `wi` CLI instead: check that Node.js 20.12 or later is installed, run `npm install --global recursive-board`, then run `wi setup`."
>
> To install without an agent, see [Install the Obsidian plugin](#install-the-obsidian-plugin). For headless use and scripts, see [Install `wi`](#install-wi).

Recursive Board turns a folder of Markdown files in an Obsidian vault into a hierarchical work board. Each work item is one Markdown file. Its parent link defines where it belongs.

**Markdown is canonical. The plugin is a view, never the database.** The plugin renders and edits work items in Obsidian. The `wi` command-line tool supports scripts and agents. Both use the same schema and rules.

Recursive Board works with local vaults and vaults synchronized by Obsidian Sync or another sync client. Install the plugin files in the vault's `.obsidian` folder. `wi` is optional: install it where you run headless commands or scripts. Sync clients can then synchronize the Markdown and plugin files according to their settings.

## Work items

Each work item is a Markdown file in the configured work-item folder. The default folder is `Boards/`. Frontmatter contains these core fields:

| Field | Purpose |
| --- | --- |
| `type` | Identifies the file as a `work-item`. |
| `id` | Stable, unique work-item identifier. |
| `title` | Work-item title. |
| `status` | One of `backlog`, `options`, `doing`, or `done`. Child items have a status; root items do not. |
| `parent` | Obsidian wikilink to the parent item. Root items omit this field. |
| `created` | Creation date in `YYYY-MM-DD` form. |
| `updated` | Last-updated date in `YYYY-MM-DD` form. |
| `board` | Set to `true` to render this item's children as a board. Otherwise omit it. |
| `prev_status` | Previous status recorded when an item moves to `done`; cleared when it leaves `done`. |
| `area` | Set to `true` for an ongoing area. Areas keep a status and have no `prev_status`. |

Optional fields include `assignee`, `priority`, `due`, `depends_on`, `tags`, and `archived`. `assignee` names the people and agents who do the card's work: one name, or a list such as `assignee: [Ana, codex-1]`. `wi` writes a plain value for one name. A reader takes `assignee`, else an old card's `holder`, else the old `agent`, and a card with more than one of these keys uses the first in that order. The assignee `agent` asks for any agent. `wi` does not rewrite an old card to migrate it. Unknown frontmatter keys are preserved. `wi validate` reports them as warnings. Old cards may keep `owner`, `creator` and `creator_model`. They are preserved, and nothing writes or reads them, because no command uses them now (docs/adr/0064-validate-checks-no-creator.md). A leftover `blocked` key is unknown and produces a warning.

An item with `board: true` renders its children in status columns. Any other item renders its children as a checklist. The plugin reads the item's frontmatter and generates the view; the Markdown files remain the source of truth.

Every child card has a **Promote** control at the top, even before it has children. Promote it to give its own children a board. A one-line child count at the top jumps to the checklist below the note.

The command **Open work item…** finds a card by part of its id or its title, and opens it. Type a full id (`wi-k7m3`), the part after `wi-` (`k7m3`), the start of an id, or words from the title. An id match comes before a title match, and open cards come before done and archived cards. Each row shows the title, the id, and the parent path. On a phone it is in the ribbon menu. You can also add it to the toolbar.

A link of the form `obsidian://recursive-board?vault=<vault>&id=<id>` opens the card with that id, on desktop and mobile. Scripts and agents can print it. The id works with or without `wi-`. An unknown id shows a notice. When two cards share the id, the link opens the first and the notice names both.

## Vault configuration

Set the board settings in **Settings → Recursive Board → Board**. The section sets the card folder, the default parent (`defaultRoot`), the extra sections (one chip per heading), and first-child promotion. The agent limit is under **Dispatcher**.

The plugin stores the board settings under the `board` key of its data file, `.obsidian/plugins/recursive-board/data.json`. `wi` reads that file and never writes it:

```json
{
  "board": {
    "workItemFolder": "Boards",
    "defaultRoot": "Project",
    "extraSections": ["References", "Risks"],
    "maxAgents": 3,
    "autoPromote": true
  }
}
```

`workItemFolder` is a vault-relative folder path. It defaults to `Boards`. In the settings tab, **Rename** renames the folder with all its cards in one step. Links name files, not folders, so they keep working. If a folder with the new name exists, the board reads that folder and moves nothing. `defaultRoot` is a root filename stem. It defaults to `null`, so `wi new` needs an explicit `--parent`. `extraSections` lists non-empty, single-line headings. Each heading follows the built-in sections, empty like them. These settings apply to `wi new` and plugin item creation. Invalid values stop config loading.

`maxAgents` is a non-negative whole number or `null` for no limit. `WI_MAX_AGENTS` overrides it for one CLI run. `wi agents` reports the limit and the active agents. One agent counts once when it holds a card and its subtask. An agent whose doing card only waits on its children, because every open child is in doing, does not count. Nor does an agent whose doing card waits on a person, which is a review. The limit is advisory. `wi claim` can exceed it.

Obsidian Sync carries the plugin data file only when **Installed community plugins** sync is on for the device. Turn it on for each device. A device without the `board` key uses the defaults and shows a notice once. [Read the Obsidian Sync settings](https://obsidian.md/help/sync/settings).

`autoPromote` is `true` or `false`. It defaults to `true`. When `wi new` or the board's add row gives a card its first child, it also sets `board: true` on that card, so the children show as a board. It never changes a root, an area, a card that already has children, or a card that has a `board` key. Undoing an add in Obsidian also restores the parent when the add promoted it.

The board hides old `area/` tags. The Tags… picker leaves them out. New cards get no area tags. The plugin ignores the old `areaTags` setting. It keeps that key when it saves other settings.

`wi setup` writes the selected vault to the user config at `$XDG_CONFIG_HOME/wi/config.json`, or `~/.config/wi/config.json` when `XDG_CONFIG_HOME` is unset. The format is `{"defaultVault":"/absolute/path/to/vault"}`. Vault detection uses Obsidian's registry on macOS, Linux, and Windows. `--vault <path>` selects a vault directly, and `--yes --vault <path>` runs without prompts.

`wi` finds the vault from `--vault <path>`, then `$WI_VAULT`, then the vault the current folder is in (the nearest folder with the plugin data file or `Boards/`), then `defaultVault` in `~/.config/wi/config.json` (or `$XDG_CONFIG_HOME/wi/config.json`).

## Start a board

### Create one in Obsidian

Enable Recursive Board in an empty vault. Use the **Create your first board** button in the notice, or run **Create your first board** from the command palette. Enter a name. The default is `Main`. The plugin creates the board and a starter card. It sets `defaultRoot` in the board settings, then opens the board.

### Manual fallback

1. Create the file `Boards/Project.md` with this content. A root item has no `parent` and no `status`:

   ```markdown
   ---
   type: work-item
   id: wi-0001
   title: Project
   created: 2026-01-01
   updated: 2026-01-01
   board: true
   ---
   ```

2. Open the vault in Obsidian with the plugin on. In **Settings → Recursive Board → Board**, set **Default parent** to `Project`.
3. Add a card with `wi new "Write the first card"`.
4. Open `Project` in Obsidian. The plugin shows its children as a board.

## Ask a person to review a card

A review is a wait on a person. It uses the same `depends_on` field and the same commands as a wait on another card.

- **Ask.** Choose **Waits on…** in the card's menu and pick a person, or run `wi depend <ref> --on <person>`. The person is a note with `type: person`. The command adds a link to that note in `depends_on`, next to any card links, and writes no note.
- **Send back.** The person removes the wait: **Stop waiting on…** in the menu, or `wi depend <ref> --on <person> --off`. The card stays in doing with its assignee.
- **Approve.** The person moves the card to done: tick it, or run `wi status <ref> done`. Moving a card to done removes its waits on people. A person who moves a card to done approves it, whether or not they meant to.

While a card waits on a person, `wi claim` and `wi status <ref> doing` refuse it, and `wi agents` does not count the agent that holds it. Say what to check on the card, in its Notes, or send it by mail or message: `wi` writes no review request. `wi review`, `wi approve` and `wi send-back` are retired. Each prints the command above and exits 0.

## Dashboard

Recursive Board ships no dashboard.

To build your own dashboard, read the card files, or use these `wi` commands:

- `wi agents --json`: the agents that count against `maxAgents`, their doing cards, and the limit.
- `wi children <ref> --tree --json` and `wi show <ref> --json`: the cards, their briefs and their notes.
- `wi ready --json`: the cards a dispatcher can start.
- `wi show <ref> --json`: `personDependencies` lists the people a card waits on, which is a review request.

## Install the Obsidian plugin

Open **Settings → Community plugins → Browse**, find **Recursive Board**, select **Install**, then enable it.

To install it manually, use the GitHub release:

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/vic-cio/recursive-board/releases/latest).
2. Create the folder `.obsidian/plugins/recursive-board/` in the vault.
3. Copy the three files into it.
4. In Obsidian, open **Settings → Community plugins** and enable **Recursive Board**.

To build from source instead, run `npm run build` and copy the same three files from `dist/`.

Reload Obsidian after replacing plugin files. If your vault syncs its `.obsidian` folder, the sync client can copy the installed plugin to your other devices. Sync behavior depends on that client's settings.

`wi update` replaces these three files in the default vault from the `wi` package. It does not create the folder.

## Install `wi`

Install `wi` for headless use and scripts, for example on a server with no Obsidian app. `wi` is the CLI package `recursive-board`. It requires Node.js 20.12 or later and installs the `wi` binary:

```sh
npm install --global recursive-board
wi --help
wi setup
```

`wi setup` copies the agent skill and saves the default vault. It writes nothing into the vault and stores no state. `--yes` asks no questions. `--json` prints one object, with the vault, the config path and the outcome for each skill copy, and asks no questions, so it needs `--vault <path>`. `wi doctor` checks the install and the vault.

To update, run `wi update`:

```sh
wi update --dry-run
wi update
```

It does four steps, and reports each one:

1. It installs the newest `recursive-board` with npm.
2. It replaces both skill copies, as `wi setup` installs them.
3. It replaces `main.js`, `manifest.json`, and `styles.css` in the default vault's plugin folder. Then it says to reload Obsidian, and to force-quit and open it again on the phone.
4. It prints the changelog's Agent setup changes since your old version.

At the current version, it installs nothing and still refreshes the skill and plugin copies. It leaves symlinked development installs alone. It does not create a missing plugin folder: install the plugin as [Install the Obsidian plugin](#install-the-obsidian-plugin) says. `--dry-run` writes nothing.

Pass `--vault <path>`, set `WI_VAULT`, run `wi` inside a vault, or set `defaultVault` with `wi setup`. Commands accept a work-item id, filename, or title as a reference. An id takes precedence when references are ambiguous. Add `--json` for machine-readable output. The `--vault <path>` and `--json` flags apply to all commands.

## Use with coding agents

`skills/recursive-board/SKILL.md` teaches an agent to read and change a vault through `wi`. `wi setup` installs copies into `~/.claude/skills/recursive-board/` and `~/.agents/skills/recursive-board/`. It leaves symlinked development installs alone and refuses to replace an unmanaged folder unless you pass `--force`. From a source checkout, `npm run install:skill` links the skill and `wi` into `~/.local/bin`.

The optional refocus hook sends a card's Objective chain after compaction or Claude transcript growth. Add its settings entries yourself to enable it.

### Run commands through the Obsidian CLI

On a desktop, an agent may run a `wi` command line through the plugin, with no Node. This is for agents only. The plugin's install steps above do not need it.

The one step a person must do is to turn on **Settings → General → Advanced → Command line interface** in Obsidian. The agent needs three more things:

- Obsidian must be running. If it is not, the CLI exits with 'The CLI is unable to find Obsidian...', and an agent falls back to `wi` or asks for input.
- The Obsidian installer must be 1.12.7 or later, from [obsidian.md/download](https://obsidian.md/download). An older one prints a warning line before every reply and hangs when Obsidian is closed.
- The call is on a desktop. The phone has no Obsidian CLI.

```sh
obsidian vault=<name> recursive-board cmd="status wi-1 done" agent=<name> model=<model>
```

- Pass `vault=<name>` as the first argument of every call, so the command cannot reach the vault that has focus.
- The reply succeeded only when its first line is exactly `ok`. Any other first line is a failure, and the exit code is always 0.
- Put the whole command line, flags included, in `cmd`. Quote a title with an apostrophe as `cmd="new \"Ana's card\" --parent wi-1"`.
- `agent=` and `model=` sign a claim or a note, as `WI_AGENT` and `WI_MODEL` do. `cmd=help` prints the `wi --help` text.

The plugin serves every `wi` command. On the plugin, `setup`, `doctor` and `update` write nothing. `cmd=setup` prints what the plugin CLI needs and the skill's text with the paths where an agent saves it. `cmd=doctor` runs the vault checks and lists the install checks that need `wi doctor`. `cmd=update` prints the plugin and rules versions, and says to update from Settings, Community plugins. [ADR 0078](docs/adr/0078-one-plugin-cli-handler.md) records the handler, and [ADR 0080](docs/adr/0080-the-plugin-serves-setup-doctor-and-update-and-writes-nothing.md) the three install commands.

## Version the vault with Git (optional)

Git is optional. Recursive Board works without it, and a solo user with no agents does not need it. It pays off when a team grows or when agents write to the vault, because each commit is a point that you can go back to.

If your vault is a Git repository, a pre-commit hook can run `wi validate` and stop a commit when the vault has errors. The hook needs Node and `wi`. Save this snippet as `.git/hooks/pre-commit`, replace the three paths with absolute paths, and run `chmod +x .git/hooks/pre-commit`:

```sh
#!/bin/sh
# Check the vault before each commit. To skip the check once: git commit --no-verify
exec "/absolute/path/to/node" "/absolute/path/to/wi.js" validate --vault "/absolute/path/to/vault"
```

To set it up:

1. Find the path of Node: `command -v node`.
2. Find the path of the `wi` entry point: `echo "$(npm root -g)/recursive-board/dist/wi/wi.js"`.
3. Save the snippet as `.git/hooks/pre-commit` in the repository. Replace the three paths. When the vault is a subfolder of the repository, name the subfolder.
4. Make the file executable: `chmod +x .git/hooks/pre-commit`.
5. Run `wi doctor`. Its `hook` check reads the file and writes nothing.

Keep these points in mind:

- **Absolute paths.** A Git GUI client starts the hook without your shell `PATH`, so a bare `node` or `wi` may not be found. The snippet runs the `wi.js` file with Node, and not the `wi` command, because the `wi` command starts with `#!/usr/bin/env node`, which needs `node` on the `PATH`.
- **A path that changes.** An upgrade of Node can change its path. Use the path that `command -v node` prints. Do not use the folder that this path links to, because a package manager can put the version in that folder name.
- **A hook that cannot run.** Git refuses every commit while the hook fails. Skip it once with `git commit --no-verify`, then correct the paths.
- **Remove it.** Delete `.git/hooks/pre-commit`.

`wi doctor` reports whether a pre-commit hook runs validation. `wi hook` is removed: a hook that it installed earlier keeps working.

## Commands

| Command | What it does |
| --- | --- |
| `wi setup [--yes] [--vault <path>] [--force] [--json]` | Installs the agent skill and saves a default vault. It writes nothing into the vault. `--yes` requires `--vault` and asks no questions. `--json` prints one object, asks no questions, and requires `--vault`. |
| `wi doctor [--json]` | Checks the install and the vault, and prints each check as pass, note or fix. A fix prints the command to run. It writes nothing. It exits 1 only when the install is broken (docs/adr/0070-wi-doctor-checks-on-request.md). |
| `wi update [--dry-run] [--from <version>] [--vault <path>]` | Installs the newest package with npm, then runs the new `wi` to refresh both skill copies and the vault's plugin files. It prints the changelog's Agent setup changes. `--dry-run` writes nothing. `--from <version>` skips the install and names the old version. |
| `wi new <title> [--parent <ref>] [--status <status>] [--template <name>] [--holder <name>] [--priority <number>] [--objective <text>] [--context <text>]... [--criteria <text>]... [--strict]` | Creates a work item under the given parent. It copies no assignee. The flag `--assignee <name>` also names an assignee, and `--holder` still works. If `--parent` is omitted, uses `defaultRoot` from the board settings. The brief flags fill the body: repeat `--context` for each paragraph and `--criteria` for each criterion. It wraps bare angle-bracket text in backticks and preserves code, links, autolinks, and HTML. It warns when the card has no Objective or Acceptance Criteria, and `--strict` refuses the card instead. Unsafe filename characters in the title become hyphens; a filename clash adds the id suffix and never overwrites. See `autoPromote`. |
| `wi status <ref> <status>` | Changes an item's status. Use `backlog`, `options`, `doing`, or `done`. Leaving `done` clears the recorded previous status. When the item was its parent's last open child, it says so; it does not close the parent. |
| `wi note <ref> <text> [--agent <name>]` | Adds a dated line under Notes. It signs with `--agent` or `WI_AGENT`. It adds `WI_MODEL` when set, and refuses to write without a writer name. It wraps bare angle-bracket text in backticks. It preserves code, links, autolinks, and HTML. A lock keeps two notes from overwriting each other. |
| `wi new … [--tag <tag>]...` | Adds each free tag, such as a role tag `role/checker`. `--assignee` names who does the work, and `--holder` still works. Cards do not record their creator. `--strict` checks only the brief. |
| `wi set <ref> [--role ""]` | `--role ""` removes an old `role` field. The command takes no other flag. |
| `wi depend <ref> --on <ref\|person> [--off]` | Makes a card wait on another card or on a person, or with `--off` stops it. A person is a note with `type: person`, and a wait on one is a review request. `wi claim` and `wi status <ref> doing` refuse a card that waits on a card that is not done, or on any person. The board allows it and shows a notice. `wi status <ref> done` removes the card's waits on people, which approves the review, and names each card that can start now. See [Ask a person to review a card](#ask-a-person-to-review-a-card). |
| `wi area <ref> [--off]` | Marks a card as an area or removes the area mark. The current status stays in place. Conversion refuses a card with an assignee. |
| `wi tag <ref> <tag> [--off]` | Adds a free tag to a card, or with `--off` removes it. Case and a leading `#` do not matter. It refuses old `area/` tags. On the board, **Tags…** in the card menu does the same: it lists the card's free tags, checked, then the other free tags on work items, and adds a tag you type. |
| `wi claim <ref> [--holder <name>]` | Adds `--holder`, or else `WI_AGENT`, to the card's assignees and moves the card to doing in one write. The flag `--assignee <name>` does the same. It starts a card with no assignee, a card assigned to `agent`, or a card that lists the claimant already: a named assignee claims the card to start it. The claimant's name replaces `agent`, and the other assignees stay. It refuses a card that others hold and that asks for no agent: an assignee runs `wi assign <ref> --to agent` first. It also refuses the name `agent`, a done card, an open dependency, and a board with a child in doing that another agent or a person works. An agent can hold a card and its current subtask at once. Repeating an active claim by the same agent writes nothing. |
| `wi assign <ref> --to <person\|agent> [--role <name>] [--off]` | Adds one name to the card's assignees and nothing else: the status stays, and no note is written. For a person, it adds their name. For `agent`, it adds `agent`, which asks any agent. It starts no agent. `--off` removes the name and leaves the status. `--role` adds the role tag in the same write. See [Assign a card](#assign-a-card). |
| `wi delegate` | Retired. It exits 0, writes nothing, and names `wi assign`. |
| `wi review`, `wi approve`, `wi send-back` | Retired. Each exits 0, reads nothing, and names the command to use: `wi depend <ref> --on <person>` to ask, `wi depend <ref> --on <person> --off` to send back, and `wi status <ref> done` to approve. See [Ask a person to review a card](#ask-a-person-to-review-a-card). |
| `wi ready [--parent <ref>] [--holder <name>] --json` | Lists unclaimed cards in options that a dispatcher can start. A card with any assignee but `agent` is taken. The flag `--assignee <name>` does the same as `--holder`. `--parent` limits the result to descendants of one board; without it, the query covers the vault. It lists the cards whose only assignee is `agent` first, then sorts by priority, then update date. JSON gives each card's `assignees` as a list, and names excluded option cards and reasons. `--holder` permits a board whose active child that agent holds. |
| `wi agents [--json]` | Prints the agents that count against `maxAgents`, each with the doing cards it works, the count and the limit. JSON gives `activeAgents`, `maxAgents` (`null` for no limit) and `agents`. Each agent on a doing card counts, so a card with two agents uses two places. A person, a request for any agent, a card whose open children are all in doing, and a card that waits on a person add no agent. It writes nothing. |
| `wi dashboard` | Retired. It exits 0, reads nothing, and names `wi agents`. See [Dashboard](#dashboard). |
| `wi release <ref> --reason <text> [--where <branch-or-path>] [--holder <name>]` | Removes one assignee and adds a note with the reason and optional work location, in one write. It removes `--holder`, else `WI_AGENT` when that holds the card, else the only assignee. The flag `--assignee <name>` does the same. With several assignees and no name to choose by, it refuses. The status stays while another named assignee remains; otherwise the card moves to options. The note is signed like `wi note`: by `WI_AGENT`, else the assignee. Refuses an unclaimed card. |
| `wi move <ref> --to <ref>` | Changes the item's parent. Its status stays the same, and its children move with it. |
| `wi archive <ref> [--undo]` | Archives an item. `--undo` unarchives it. Archived items are hidden from normal reads; descendants are hidden with an archived parent. |
| `wi promote <ref>` / `wi demote <ref>` | Makes an item a board or a card again. Promotion sets `board: true`; demotion removes the `board` key. |
| `wi rm <ref> [--recursive] [--dry-run]` | Moves an item to the vault's `.trash` folder. Use `--dry-run` to preview. Items with children require `--recursive`. |
| `wi children <ref> [--status <status>] [--tree] [--archived]` | Lists an item's children. `--status` filters by status, `--tree` shows descendants, and `--archived` includes archived items. |
| `wi show <ref> --json` | Reads one complete card as JSON. It includes the brief, Notes, Knowledge lines, the assignees as a list (`assignees`), ancestor objectives, dependencies, the people it waits on (`personDependencies`), and child summary. Broken links appear as issues; the command changes no files. |
| `wi objective [<ref>]` | Retired command. Exits 0 and names `wi show <ref> --json`. |
| `wi validate` | Checks work-item structure and reports errors and warnings. Exits with code 1 when it finds errors. |
| `wi hook` | Removed. It is an unknown command. A hook that it installed earlier keeps working. See [Version the vault with Git](#version-the-vault-with-git-optional). |
| `wi here` | Retired. Exits 0 and changes nothing. A project's `AGENTS.md` names its board; pass it to `wi new` as `--parent`. |
| `wi template` | Retired command. Prints a message that names `wi new --template` and exits with code 0. |
| `wi --help` or `wi help` | Prints usage, options, and notes. |
| `wi --version` | Prints the installed CLI version, then the rules version: `1.0.0 (rules 1)`. |

Each command takes only the flags its row shows, plus `--vault` and `--json` where it reads a vault or prints a result. It refuses any other flag with exit code 2 and names the flag, so a flag cannot look as if it worked. `wi archive` refuses `--dry-run`: an archive changes one flag, and `--undo` reverses it.

`wi template` no longer lists or writes template files. Use `wi new --template <name>` when you create a work item. The available names are `work-item`, `first-board-card`, and `area`.

`wi new --template area` creates an area in `backlog` by default. Pass `--status` to choose its
starting status. Areas appear in their status column. A root board also shows a chip for every area in options or doing anywhere below it, in one row above its columns. The phone shows the same row of small chips. A backlog or done area stays in its column only, and a board that is not a root shows no area bar.

An area's own board also shows the area as a self-card in its status column, the same as the area's card on its parent board. The plugin only draws it: it adds no file and no count, and `wi` never sees it. A drag to another column sets the area's status. Its preview opens the same board with a short zoom.

`wi move`, `wi rm`, and `wi archive` refuse to run when a hidden non-Markdown file is in the work-item folder. The index cannot read that file, so it may be missing a work item. Let the sync client finish downloading it or remove the stray file, then retry. There is no force option. `wi new` still creates the item and warns on stderr because a new id or filename may clash with an unread file. `wi validate` reports a warning if `defaultRoot` names no root item.

## For agents

Use `wi` for work-item changes. Do not edit work-item Markdown directly with scripts or bulk text tools. Use `wi validate` to check the vault after changes. `wi rm` moves items into `.trash`; removing a parent requires `--recursive`. Use `wi rm <ref> --dry-run` to review the affected items first.

A dispatcher runs `wi agents --json` before starting workers and holds off when `activeAgents` reaches `maxAgents`. Each agent counts while it works a doing card, so a card with two agents uses two places; a card whose open children are all in doing only waits, so it does not count; `null` means there is no configured limit. Set `WI_MAX_AGENTS` for a one-run override. The limit is advisory, and `wi claim` does not enforce it. A dispatcher leaves a card for any agent with `wi assign <ref> --to agent`, or starts an agent itself with its own harness's tools. The agent claims the card with `wi claim <ref>`, which names it by `WI_AGENT`, or with `--assignee <name>` (or `--holder <name>`). `wi claim` warns when the agent passes the limit, and it does not refuse. If that agent stops, the dispatcher runs `wi release <ref> --reason <text> [--where <branch-or-path>]` so the next worker can find the unfinished work. Keep a card in doing until its work is accepted.

A role is optional. It is a free tag such as `role/checker` on a card. A note that is not a work item and carries the same tag is that role's procedure, wherever the note lives. Roles do not pass down the tree. `wi validate` warns only when two notes carry one role tag (docs/adr/0062-role-tags.md).

### Assign a card

Assigning adds one name to the card's `assignee` and changes nothing else. The status stays: the assigner moves the card if it must move, or the assignee does when they start. A card can have several assignees, for example a person and an agent. One assignee is a plain value, `assignee: Ana`. Several are a list. The flag `--holder` still works in place of `--assignee`.

`wi assign <ref> --to <person>` adds a person. It writes no note; people explain a hand-off on the platform they talk on. The person needs a note with `type: person` in its frontmatter, in any folder, for example `People/Ana.md`. A person does not count toward `maxAgents`. Any other name is refused, so a typo cannot pass for an agent.

`wi assign <ref> --to agent` adds `agent`: any agent may take the card. It starts nothing and writes no note. The first agent's `wi claim` replaces `agent` with its own name and keeps the other assignees. `wi ready` lists a card whose only assignee is `agent` first. A card with any other assignee is taken, so a person who wants an agent on their card assigns `agent` and starts the agent with the card id. A person note called `agent` is refused, because the name is reserved.

`wi assign <ref> --to <name> --off` removes one assignee and leaves the status. `wi release` also removes one assignee, writes a note, and moves the card to options when no named assignee remains. In the plugin, **Assign to…** in the card menu adds a person or an agent, and **Unassign <name>** removes one. The card shows the first assignee's initial and `+N` for the others. The assignee chip on a card face reads `Assigned to <names>` on hover, and the assignee pill in the open card header reads `Assigned to <names>`.

The plugin makes no rule about who may assign whom: no check, no permission, and no required level or title. A team may use the levels of the tree as it likes, for example the assignee one level down as the owner. The plugin does not check that convention.

wi starts no agent. Your harness starts agents with its own tools: a subagent, a background task, or another session. Give the agent the card id. It reads its brief with `wi show <ref> --json`: the card, the Objective of each ancestor, the Knowledge links, and each role tag with the notes that carry it. Then it claims the card by its own name, writes signed notes, and asks for review with `wi depend <ref> --on <person>` (docs/adr/0063-wi-starts-no-agents.md).

`wi note` signs with `WI_AGENT` or `--agent`, and adds `WI_MODEL` when set. It refuses to write without a writer name. `--role <name>` on `wi assign` adds the tag `role/<name>` with the assignee.

## Development

Requirements: Node.js 23.6 or later and npm. The tests run the TypeScript source directly, which needs type stripping. The built `wi` runs on Node.js 20.12 or later.

```sh
npm install
npm test
npm run build
npm run fixture
npm run fixture -- --review --vault <path>
```

`npm test` typechecks the CLI and plugin, then runs the test suite. `npm run build` builds the plugin and CLI. `npm run fixture` generates the development vault fixture in `test/Boards/`. That fixture is deliberately invalid: it has an orphan and an unknown key, to test the validator.

`npm run fixture -- --review --vault <path>` writes a clean review set into the vault at `<path>`, so you can check the board UI by eye. The set has 25 work items and the people notes `People/Victor.md` and `People/Sam.md`. Each card's title says what to look at: each kind of chip, waits on a card and on a person, one, two and any-agent assignees, a long title, several labels, an area with children, and done cards. `wi validate` reports 0 errors and 0 warnings. The mode needs `--vault`, because it has no default. It refuses a path with no `.obsidian` folder. It replaces only what it wrote before: its own cards and the two people notes. It stops, and deletes nothing, when `Boards/` holds a work item that is not in the set or under its `Test board` root. It also stops when `People/Victor.md` or `People/Sam.md` holds other text. Run it again to reset the vault.

## Decisions

See [`docs/adr/`](docs/adr/) for the project's decision record.

## License

MIT. See [LICENSE](LICENSE).
