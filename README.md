# Recursive Board

> **Install with your agent.** Paste this prompt into your coding agent: "Check that Node.js 20.12 or later is installed, run `npm install --global recursive-board`, then run `wi setup`. Show me the recommended agent setup that `wi setup` prints at the end, and tell me that it is optional."

Recursive Board turns a folder of Markdown files in an Obsidian vault into a hierarchical work board. Each work item is one Markdown file. Its parent link defines where it belongs.

**Markdown is canonical. The plugin is a view, never the database.** The plugin renders and edits work items in Obsidian. The `wi` command-line tool supports scripts and agents. Both use the same schema and rules.

Recursive Board works with local vaults and vaults synchronized by Obsidian Sync or another sync client. Install the plugin files in the vault's `.obsidian` folder, and install `wi` wherever you run commands. Sync clients can then synchronize the Markdown and plugin files according to their settings.

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

Optional fields include `owner`, `holder`, `priority`, `due`, `depends_on`, `tags`, and `archived`. `holder` names the person or agent who does the card's work; an old card's `agent` is read as its holder, and `holder: agent` asks for any agent. Unknown frontmatter keys are preserved. `wi validate` reports them as warnings. `owner` holds a plain name. `wi validate` warns when it is written as a link, and does not check the note it names. Old cards may keep `creator` and `creator_model`. They are preserved, and `wi validate` does not check them, because no command writes them now (docs/adr/0064-validate-checks-no-creator.md). A leftover `blocked` key is unknown and produces a warning.

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

`maxAgents` is a non-negative whole number or `null` for no limit. `WI_MAX_AGENTS` overrides it for one CLI run. `wi agents` reports the limit and the active agents. One agent counts once when it holds a card and its subtask. An agent whose doing card only waits on its children, because every open child is in doing, does not count. Nor does an agent whose doing card waits for a review verdict. The limit is advisory. `wi claim` can exceed it.

Obsidian Sync carries the plugin data file only when **Installed community plugins** sync is on for the device. Turn it on for each device. A device without the `board` key uses the defaults and shows a notice once. [Read the Obsidian Sync settings](https://obsidian.md/help/sync/settings).

`autoPromote` is `true` or `false`. It defaults to `true`. When `wi new` or the board's add row gives a card its first child, it also sets `board: true` on that card, so the children show as a board. It never changes a root, an area, a card that already has children, or a card that has a `board` key. Undoing an add in Obsidian also restores the parent when the add promoted it.

The board hides old `area/` tags. The Tags… picker leaves them out. New cards get no area tags. The plugin ignores the old `areaTags` setting. It keeps that key when it saves other settings.

`wi setup` writes the selected vault to the user config at `$XDG_CONFIG_HOME/wi/config.json`, or `~/.config/wi/config.json` when `XDG_CONFIG_HOME` is unset. The format is `{"defaultVault":"/absolute/path/to/vault"}`. Vault detection uses Obsidian's registry on macOS, Linux, and Windows. `--vault <path>` selects a vault directly, and `--yes --vault <path>` runs without prompts.

`wi` finds the vault from `--vault <path>`, then `$WI_VAULT`, then the vault the current folder is in (the nearest folder with the plugin data file or `Boards/`), then `defaultVault` in `~/.config/wi/config.json` (or `$XDG_CONFIG_HOME/wi/config.json`).

## Start a board

### Create one in Obsidian

Enable Recursive Board in an empty vault. Use the **Create your first board** button in the notice, or run **Create your first board** from the command palette. Enter a name. The default is `Main`. The plugin creates the board and a starter card. It sets `defaultRoot` in the board settings, then opens the board.

Agents and people who read the repo find the optional [agent playbook](docs/playbook.md) here. The plugin does not show it.

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

## Send a card for review

Use **Send for review…** in a card's menu to choose a person, say what to check, attach files from your computer, and add web links or vault paths. An attached file outside the vault is copied into Obsidian's attachment folder. The command sets the card's `owner` and adds a `**Review:**` note. Agents use `wi review`, which makes the same edit. The reviewer gives the verdict with `wi approve` or `wi send-back`, or with a dashboard.

## Dashboard

Recursive Board ships no dashboard. The example dashboard is [Recursive Board Dashboard](https://github.com/vic-cio/recursive-board-dashboard), a separate Obsidian plugin. It shows what waits for your review, progress per area, the agents, the people and the cards that need attention, and it gives **Approve** and **Send back**. It is an example to copy: it has no releases and no community listing. It reads the card files through Obsidian, so it works on a phone.

To build your own dashboard, read the card files, or use these `wi` commands:

- `wi agents --json`: the agents that count against `maxAgents`, their doing cards, and the limit.
- `wi children <ref> --tree --json` and `wi show <ref> --json`: the cards, their briefs and their notes.
- `wi ready --json`: the cards a dispatcher can start.
- `wi review`, `wi approve` and `wi send-back`: the review loop.

## Install the Obsidian plugin

Once the plugin is listed in the Community plugins directory, open **Settings → Community plugins → Browse**, find **Recursive Board**, select **Install**, then enable it.

Before listing, you can install a release manually:

1. Download a release or build the project with `npm run build`.
2. Create a folder under the vault's plugin directory using the `id` in `manifest.json` as its name.
3. Copy `main.js`, `manifest.json`, and `styles.css` from that release or directly from `dist/` into it.
4. In Obsidian, open **Settings → Community plugins** and enable **Recursive Board**.

Reload Obsidian after replacing plugin files. If your vault syncs its `.obsidian` folder, the sync client can copy the installed plugin to your other devices. Sync behavior depends on that client's settings.

`wi update` replaces these three files in the default vault from the `wi` package. It does not create the folder.

## Install `wi`

`wi` is the CLI package `recursive-board`. It requires Node.js 20.12 or later and installs the `wi` binary:

```sh
npm install --global recursive-board
wi --help
wi setup
```

`wi setup` ends with the optional recommended agent setup. It prints the summary of the [agent playbook](docs/playbook.md), the path of the installed `docs/playbook.md`, and `wi doctor`, the command that checks a vault against it. Setup writes nothing into the vault for it and stores no state. `--yes` prints the same text. `--json` prints one object, with the summary in `recommendedSetup`, and asks no questions, so it needs `--vault <path>`.

To update, run `wi update`:

```sh
wi update --dry-run
wi update
```

It does four steps, and reports each one:

1. It installs the newest `recursive-board` with npm.
2. It replaces both skill copies, as `wi setup` installs them.
3. It replaces `main.js`, `manifest.json`, and `styles.css` in the default vault's plugin folder. Then it says to reload Obsidian, and to force-quit and open it again on the phone.
4. It prints the changelog's Agent setup changes since your old version, and suggests `wi doctor`.

At the current version, it installs nothing and still refreshes the skill and plugin copies. It leaves symlinked development installs alone. It does not create a missing plugin folder: install the plugin as [Install the Obsidian plugin](#install-the-obsidian-plugin) says. `--dry-run` writes nothing.

Pass `--vault <path>`, set `WI_VAULT`, run `wi` inside a vault, or set `defaultVault` with `wi setup`. Commands accept a work-item id, filename, or title as a reference. An id takes precedence when references are ambiguous. Add `--json` for machine-readable output. The `--vault <path>` and `--json` flags apply to all commands.

## Use with coding agents

`skills/recursive-board/SKILL.md` teaches an agent to read and change a vault through `wi`. `wi setup` installs copies into `~/.claude/skills/recursive-board/` and `~/.agents/skills/recursive-board/`. It leaves symlinked development installs alone and refuses to replace an unmanaged folder unless you pass `--force`. From a source checkout, `npm run install:skill` links the skill and `wi` into `~/.local/bin`.

The optional [agent playbook](docs/playbook.md) describes one agent setup that works: a session agent, headless workers that split their cards, role notes, a shared Dispatching procedure, and the agent limit. It has texts to paste into a vault's `AGENTS.md` and `Roles/` folder. Nothing in Recursive Board needs it. The npm package ships it at `docs/playbook.md`. Run `wi doctor` to compare your vault with it. It prints the text to paste for each recommendation that the vault does not follow.

The optional [refocus hook](docs/refocus-hook.md) sends a card's Objective chain after compaction or Claude transcript growth. Add its settings entries yourself to enable it.

## Install the Git validation hook

Git is optional. Recursive Board works without it, and the hook only adds a check for vaults that are Git repositories.

If your vault is a Git repository, use the installed `wi` command:

```sh
wi hook install --vault <vault-path>
```

The pre-commit hook runs `wi validate` and stops a commit when the vault has errors. It calls the Node binary and `wi` entry point used to install it, so keep that `wi` installation available. Use `wi hook status --vault <vault-path>` to inspect the hook and `wi hook uninstall --vault <vault-path>` to remove it. Installation refuses to replace another pre-commit hook unless you pass `--force`.

## Commands

| Command | What it does |
| --- | --- |
| `wi setup [--yes] [--vault <path>] [--force] [--json]` | Installs the agent skill, selects and saves a default vault, and offers the Git validation hook for a Git vault. It ends with the optional recommended agent setup and writes nothing into the vault for it. `--yes` requires `--vault` and asks no questions. `--json` prints one object, asks no questions, and requires `--vault`. |
| `wi doctor [--json]` | Checks the install and the optional agent setup, and prints each check as pass, note or fix. A fix prints the command to run or the text to paste. It writes nothing. It exits 1 only when the install is broken (docs/adr/0070-wi-doctor-checks-on-request.md). |
| `wi update [--dry-run] [--from <version>] [--vault <path>]` | Installs the newest package with npm, then runs the new `wi` to refresh both skill copies and the vault's plugin files. It prints the changelog's Agent setup changes and suggests `wi doctor`. `--dry-run` writes nothing. `--from <version>` skips the install and names the old version. |
| `wi new <title> [--parent <ref>] [--status <status>] [--template <name>] [--owner <name>] [--holder <name>] [--priority <number>] [--objective <text>] [--context <text>]... [--criteria <text>]... [--strict]` | Creates a work item under the given parent. It does not copy the parent's owner; pass `--owner` to set one. If `--parent` is omitted, uses `defaultRoot` from the board settings. The brief flags fill the body: repeat `--context` for each paragraph and `--criteria` for each criterion. It wraps bare angle placeholders in backticks and preserves code, links, autolinks, and HTML. It warns when the card has no Objective or Acceptance Criteria, and `--strict` refuses the card instead. Unsafe filename characters in the title become hyphens; a filename clash adds the id suffix and never overwrites. See `autoPromote`. |
| `wi status <ref> <status>` | Changes an item's status. Use `backlog`, `options`, `doing`, or `done`. Leaving `done` clears the recorded previous status. When the item was its parent's last open child, it says so; it does not close the parent. |
| `wi note <ref> <text> [--agent <name>]` | Adds a dated line under Notes. It signs with `--agent` or `WI_AGENT`. It adds `WI_MODEL` when set, and refuses to write without a writer name. It wraps bare angle placeholders in backticks. It preserves code, links, autolinks, and HTML. A lock keeps two notes from overwriting each other. |
| `wi new … [--tag <tag>]...` | Adds each free tag, such as a role tag `role/checker`. `--holder` names who does the work. Cards do not record their creator. `--strict` checks only the brief. |
| `wi set <ref> [--owner <name>] [--role ""]` | Changes a card's owner (an empty value removes it). `--role ""` removes an old `role` field. |
| `wi depend <ref> --on <ref> [--off]` | Makes a card wait on another card, or with `--off` stops it. `wi claim` and `wi status <ref> doing` refuse a card that waits on a card that is not done. The board allows it and shows a notice. `wi status <ref> done` names each card that can start now. |
| `wi area <ref> [--off]` | Marks a card as an area or removes the area mark. The current status stays in place. Conversion refuses a card with a holder. |
| `wi tag <ref> <tag> [--off]` | Adds a free tag to a card, or with `--off` removes it. Case and a leading `#` do not matter. It refuses old `area/` tags. On the board, **Tags…** in the card menu does the same: it lists the card's free tags, checked, then the other free tags on work items, and adds a tag you type. |
| `wi claim <ref> [--holder <name>]` | Sets the card's `holder` to `--holder`, or else `WI_AGENT`, and moves the card to doing in one write. The holder of a delegated card claims it to start it. A claim replaces `holder: agent`. Refuses a different holder, the name `agent`, a done card, an open dependency, or a board with a child in doing that another agent or a person works. An agent can hold a card and its current subtask at once. Repeating an active claim by the same agent writes nothing. |
| `wi delegate <ref> --to <person\|agent> [--role <name>]` | Sets the card's `holder` and nothing else: the status stays. For a person, it writes their name. For `agent`, it writes `holder: agent`, which asks any agent. It starts no agent. `--role` adds the role tag in the same write. See [Delegate a card](#delegate-a-card). |
| `wi review <ref> --to <name> [--files <path>]... [--note <text>]` | Sends a card to a person note for review. It sets `owner` and appends a `**Review:**` note in one write. Repeat `--files` for each vault-relative path. `--note` says what to check. The card menu uses the same edit. |
| `wi approve <ref> --you <name>` | Records the reviewer's approval. It notes `Approved by <name>.` and moves the card to done in one write. `--you` must match the card's `owner`. It refuses a card that is not in doing, has no review request after its last verdict, or has an open child. It names the cards that can start now, as `wi status <ref> done` does. |
| `wi send-back <ref> --you <name> [--comment <text>]` | Records the reviewer's send back. It notes `Sent back by <name>: <comment>` and removes `owner` in one write. The card stays in doing with its holder. The comment is optional and one line. It refuses the same cards as `wi approve`. Both sign the note with `WI_AGENT` when it is set. |
| `wi ready [--parent <ref>] [--holder <name>] --json` | Lists unclaimed cards in options that a dispatcher can start. `--parent` limits the result to descendants of one board; without it, the query covers the vault. It lists the cards with `holder: agent` first, then sorts by priority, then update date. JSON also names excluded option cards and reasons. `--holder` permits a board whose active child belongs to that agent. |
| `wi agents [--json]` | Prints the agents that count against `maxAgents`, each with the doing cards it works, the count and the limit. JSON gives `activeAgents`, `maxAgents` (`null` for no limit) and `agents`. A person, a request for any agent, a card whose open children are all in doing, and a card that waits for a review verdict add no agent. It writes nothing. |
| `wi dashboard` | Retired. It exits 0, reads nothing, and names `wi agents`. See [Dashboard](#dashboard). |
| `wi release <ref> --reason <text> [--where <branch-or-path>]` | Clears the holder, moves the card to options, and adds a note with the reason and optional work location, in one write. The note is signed like `wi note`: by `WI_AGENT`, else the holder. Refuses an unclaimed card. |
| `wi move <ref> --to <ref>` | Changes the item's parent. Its status stays the same, and its children move with it. |
| `wi archive <ref> [--undo]` | Archives an item. `--undo` unarchives it. Archived items are hidden from normal reads; descendants are hidden with an archived parent. |
| `wi promote <ref>` / `wi demote <ref>` | Makes an item a board or a card again. Promotion sets `board: true`; demotion removes the `board` key. |
| `wi rm <ref> [--recursive] [--dry-run]` | Moves an item to the vault's `.trash` folder. Use `--dry-run` to preview. Items with children require `--recursive`. |
| `wi children <ref> [--status <status>] [--tree] [--archived]` | Lists an item's children. `--status` filters by status, `--tree` shows descendants, and `--archived` includes archived items. |
| `wi show <ref> --json` | Reads one complete card as JSON. It includes the brief, Notes, Knowledge lines, assignment, ancestor objectives, dependencies, and child summary. Broken links appear as issues; the command changes no files. |
| `wi objective [<ref>]` | Retired command. Exits 0 and names `wi show <ref> --json`. |
| `wi validate` | Checks work-item structure and reports errors and warnings. Exits with code 1 when it finds errors. |
| `wi hook install\|uninstall\|status [--vault <path>]` | Installs, removes, or inspects the Git pre-commit validation hook. `install --force` replaces an unrelated hook. |
| `wi here` | Retired. Exits 0 and changes nothing. A project's `AGENTS.md` names its board; pass it to `wi new` as `--parent`. |

| `wi template` | Retired command. Prints a message that names `wi new --template` and exits with code 0. |
| `wi --help` or `wi help` | Prints usage, options, and notes. |
| `wi --version` | Prints the installed CLI version. |

Each command takes only the flags its row shows, plus `--vault` and `--json` where it reads a vault or prints a result. It refuses any other flag with exit code 2 and names the flag, so a flag cannot look as if it worked. `wi archive` refuses `--dry-run`: an archive changes one flag, and `--undo` reverses it.

`wi template` no longer lists or writes template files. Use `wi new --template <name>` when you create a work item. The available names are `work-item`, `first-board-card`, and `area`.

`wi new --template area` creates an area in `backlog` by default. Pass `--status` to choose its
starting status. Areas appear in their status column. Areas in options or doing also appear in the area bar; a backlog or done area stays in its column only.

`wi move`, `wi rm`, and `wi archive` refuse to run when a hidden non-Markdown file is in the work-item folder. The index cannot read that file, so it may be missing a work item. Let the sync client finish downloading it or remove the stray file, then retry. There is no force option. `wi new` still creates the item and warns on stderr because a new id or filename may clash with an unread file. `wi validate` reports a warning if `defaultRoot` names no root item.

## For agents

Use `wi` for work-item changes. Do not edit work-item Markdown directly with scripts or bulk text tools. Use `wi validate` to check the vault after changes. `wi rm` moves items into `.trash`; removing a parent requires `--recursive`. Use `wi rm <ref> --dry-run` to review the affected items first.

A dispatcher runs `wi agents --json` before starting workers and holds off when `activeAgents` reaches `maxAgents`. An agent counts while it works a doing card; a card whose open children are all in doing only waits, so it does not count; `null` means there is no configured limit. Set `WI_MAX_AGENTS` for a one-run override. The limit is advisory, and `wi claim` does not enforce it. A dispatcher leaves a card for any agent with `wi delegate <ref> --to agent`, or starts an agent itself with its own harness's tools. The agent claims the card with `wi claim <ref>`, which names it by `WI_AGENT`, or with `--holder <name>`. `wi claim` warns when the agent passes the limit, and it does not refuse. If that agent stops, the dispatcher runs `wi release <ref> --reason <text> [--where <branch-or-path>]` so the next worker can find the unfinished work. Keep a card in doing until its work is accepted.

A role is optional. It is a free tag such as `role/checker` on a card. A note that is not a work item and carries the same tag is that role's procedure, wherever the note lives. Roles do not pass down the tree. `wi validate` warns only when two notes carry one role tag (docs/adr/0062-role-tags.md).

### Delegate a card

Delegating sets the card's `holder` and nothing else. The status stays: the delegator moves the card if it must move, or the holder does when they start.

`wi delegate <ref> --to <person>` assigns the card to a person. Their name goes in `holder`. It writes no note; people explain a hand-off on the platform they talk on. The person needs a note with `type: person` in its frontmatter, in any folder, for example `People/Ana.md`. A card a person holds does not count toward `maxAgents`. Any other name is refused, so a typo cannot pass for an agent.

`wi delegate <ref> --to agent` writes `holder: agent`: any agent may take the card. It starts nothing and writes no note. `wi ready` lists these cards first, and the first agent's `wi claim` replaces `agent` with its own name. A person note called `agent` is refused, because the name is reserved.

wi starts no agent. Your harness starts agents with its own tools: a subagent, a background task, or another session. Give the agent the card id. It reads its brief with `wi show <ref> --json`: the card, the Objective of each ancestor, the Knowledge links, and each role tag with the notes that carry it. Then it claims the card by its own name, writes signed notes, and asks for review with `wi review` (docs/adr/0063-wi-starts-no-agents.md).

`wi note` signs with `WI_AGENT` or `--agent`, and adds `WI_MODEL` when set. It refuses to write without a writer name. `--role <name>` on `wi delegate` adds the tag `role/<name>` with the holder.

## Development

Requirements: Node.js 23.6 or later and npm. The tests run the TypeScript source directly, which needs type stripping. The built `wi` runs on Node.js 20.12 or later.

```sh
npm install
npm test
npm run build
npm run fixture
```

`npm test` typechecks the CLI and plugin, then runs the test suite. `npm run build` builds the plugin and CLI. `npm run fixture` generates the development vault fixture in `test/Boards/`.

## Decisions

See [`docs/adr/`](docs/adr/) for the project's decision record.

## License

MIT. See [LICENSE](LICENSE).
