# Commands

The plugin serves every `wi` command through the Obsidian CLI (see [Run commands through the Obsidian CLI](../README.md#run-commands-through-the-obsidian-cli)). The standalone `wi` runs the same commands with the same flags. In this page, `wi <command>` stands for both.

Commands accept a work-item id, filename, or title as a reference. An id takes precedence when references are ambiguous. Add `--json` for machine-readable output. The `--vault <path>` and `--json` flags apply to all commands. Pass `--vault <path>`, set `WI_VAULT`, run `wi` inside a vault, or set `defaultVault` with `wi setup` ([Vault configuration](configuration.md#where-wi-finds-the-vault)).

## Command table

| Command | What it does |
| --- | --- |
| `wi setup [--yes] [--vault <path>] [--force] [--json]` | Installs the agent skill and saves a default vault. It writes nothing into the vault. `--yes` requires `--vault` and asks no questions. `--json` prints one object, asks no questions, and requires `--vault`. |
| `wi doctor [--json]` | Checks the install and the vault, and prints each check as pass, note or fix. A fix prints the command to run. It writes nothing. It exits 1 only when the install is broken (docs/adr/0070-wi-doctor-checks-on-request.md). |
| `wi update [--dry-run] [--from <version>] [--vault <path>]` | Installs the newest package with npm, then runs the new `wi` to refresh both skill copies and the vault's plugin files. It prints the changelog's Agent setup changes. `--dry-run` writes nothing. `--from <version>` skips the install and names the old version. |
| `wi new <title> [--parent <ref>] [--status <status>] [--template <name>] [--holder <name>] [--priority <number>] [--objective <text>] [--context <text>]... [--criteria <text>]... [--strict]` | Creates a work item under the given parent. It copies no assignee. The flag `--assignee <name>` also names an assignee, and `--holder` still works. If `--parent` is omitted, uses `defaultRoot` from the board settings. The brief flags fill the body: repeat `--context` for each paragraph and `--criteria` for each criterion. It wraps bare angle-bracket text in backticks and preserves code, links, autolinks, and HTML. It warns when the card has no Objective or Acceptance Criteria, and `--strict` refuses the card instead. Unsafe filename characters in the title become hyphens; a filename clash adds the id suffix and never overwrites. See `autoPromote`. |
| `wi status <ref> <status>` | Changes an item's status. Use `backlog`, `options`, `doing`, or `done`. Leaving `done` clears the recorded previous status. When the item was its parent's last open child, it says so; it does not close the parent. |
| `wi note <ref> <text> [--agent <name>]` | Adds a dated line under Notes. It signs with `--agent` or `WI_AGENT`. It adds `WI_MODEL` when set, and refuses to write without a writer name. It wraps bare angle-bracket text in backticks. It preserves code, links, autolinks, and HTML. A lock keeps two notes from overwriting each other. |
| `wi new … [--tag <tag>]...` | Adds each free tag, such as a role tag `role/checker`. `--assignee` names who does the work, and `--holder` still works. `--strict` checks only the brief. |
| `wi set <ref> [--role ""]` | `--role ""` removes the `role` field from a card. The command takes no other flag. |
| `wi depend <ref> --on <ref\|person> [--off]` | Makes a card wait on another card or on a person, or with `--off` stops it. A person is a name in the plugin's People setting, or a note with `type: person`, matched without case. A wait on a person is a review request, and `depends_on` holds the plain name, such as `Ana`. An old `[[Ana]]` link to a person note still counts, and `--off` removes either form. An unknown name is refused. `wi claim` and `wi status <ref> doing` refuse a card that waits on a card that is not done, or on any person. The board allows it and shows a notice. `wi status <ref> done` removes the card's waits on people, which approves the review, and names each card that can start now. See [Ask a person to review a card](../README.md#ask-a-person-to-review-a-card). |
| `wi area <ref> [--off]` | Marks a card as an area or removes the area mark. The current status stays in place. Conversion refuses a card with an assignee. |
| `wi tag <ref> <tag> [--off]` | Adds a free tag to a card, or with `--off` removes it. Case and a leading `#` do not matter. On the board, **Tags…** in the card menu does the same: it lists the card's free tags, checked, then the other free tags on work items, and adds a tag you type. |
| `wi claim <ref> [--holder <name>]` | Adds `--holder`, or else `WI_AGENT`, to the card's assignees and moves the card to doing in one write. The flag `--assignee <name>` does the same. It starts a card with no assignee, a card assigned to `agent`, or a card that lists the claimant already: a named assignee claims the card to start it. The claimant's name replaces `agent`, and the other assignees stay. It refuses a card that others hold and that asks for no agent: an assignee runs `wi assign <ref> --to agent` first. It also refuses the name `agent`, a done card, an open dependency, and a board with a child in doing that another agent or a person works. An agent can hold a card and its current subtask at once. Repeating an active claim by the same agent writes nothing. |
| `wi assign <ref> --to <person\|agent> [--role <name>] [--off]` | Adds one name to the card's assignees and nothing else: the status stays, and no note is written. For a person, it adds their name. For `agent`, it adds `agent`, which asks any agent. It starts no agent. `--off` removes the name and leaves the status. `--role` adds the role tag in the same write. See [Assign a card](#assign-a-card). |
| `wi ready [--parent <ref>] [--holder <name>] --json` | Lists unclaimed cards in options that a dispatcher can start. A card with any assignee but `agent` is taken. The flag `--assignee <name>` does the same as `--holder`. `--parent` limits the result to descendants of one board; without it, the query covers the vault. It lists the cards whose only assignee is `agent` first, then sorts by priority, then update date. JSON gives each card's `assignees` as a list, and names excluded option cards and reasons. `--holder` permits a board whose active child that agent holds. |
| `wi agents [--json]` | Prints the agents that count against `maxAgents`, each with the doing cards it works, the count and the limit. JSON gives `activeAgents`, `maxAgents` (`null` for no limit) and `agents`. Each agent on a doing card counts, so a card with two agents uses two places. A person, a request for any agent, a card whose open children are all in doing, and a card that waits on a person add no agent. It writes nothing. |
| `wi release <ref> --reason <text> [--where <branch-or-path>] [--holder <name>]` | Removes one assignee and adds a note with the reason and optional work location, in one write. It removes `--holder`, else `WI_AGENT` when that holds the card, else the only assignee. The flag `--assignee <name>` does the same. With several assignees and no name to choose by, it refuses. The status stays while another named assignee remains; otherwise the card moves to options. The note is signed like `wi note`: by `WI_AGENT`, else the assignee. Refuses an unclaimed card. |
| `wi move <ref> --to <ref>` | Changes the item's parent. Its status stays the same, and its children move with it. |
| `wi archive <ref> [--undo]` | Archives an item. `--undo` unarchives it. Archived items are hidden from normal reads; descendants are hidden with an archived parent. |
| `wi promote <ref>` / `wi demote <ref>` | Makes an item a board or a card again. Promotion sets `board: true`; demotion removes the `board` key. |
| `wi rm <ref> [--recursive] [--dry-run]` | Moves an item to the vault's `.trash` folder. Use `--dry-run` to preview. Items with children require `--recursive`. |
| `wi children <ref> [--status <status>] [--tree] [--archived]` | Lists an item's children. `--status` filters by status, `--tree` shows descendants, and `--archived` includes archived items. |
| `wi show <ref> --json` | Reads one complete card as JSON. It includes the brief, Notes, Knowledge lines, the assignees as a list (`assignees`), ancestor objectives, dependencies, the people it waits on (`personDependencies`), and child summary. Broken links appear as issues; the command changes no files. |
| `wi validate` | Checks work-item structure and reports errors and warnings. Exits with code 1 when it finds errors. |
| `wi --help` or `wi help` | Prints usage, options, and notes. |
| `wi --version` | Prints the installed CLI version, then the rules version: `1.0.2 (rules 1)`. |

Each command takes only the flags its row shows, plus `--vault` and `--json` where it reads a vault or prints a result. It refuses any other flag with exit code 2 and names the flag, so a flag cannot look as if it worked. `wi archive` refuses `--dry-run`: an archive changes one flag, and `--undo` reverses it.

`wi new --template <name>` chooses a template when you create a work item. The available names are `work-item`, `first-board-card`, and `area`. [Areas](work-items.md#areas) says how an area shows on the board.

`wi move`, `wi rm`, and `wi archive` refuse to run when a hidden non-Markdown file is in the work-item folder. The index cannot read that file, so it may be missing a work item. Let the sync client finish downloading it or remove the stray file, then retry. There is no force option. `wi new` still creates the item and warns on stderr because a new id or filename may clash with an unread file. `wi validate` reports a warning if `defaultRoot` names no root item.

## On the plugin

On the plugin, `setup`, `doctor` and `update` write nothing. `cmd=setup` prints what the plugin CLI needs and the skill's text with the paths where an agent saves it. `cmd=doctor` runs the vault checks and lists the install checks that need `wi doctor`. `cmd=update` prints the plugin and rules versions, and says to update from Settings, Community plugins. [ADR 0078](adr/0078-one-plugin-cli-handler.md) records the handler, and [ADR 0080](adr/0080-the-plugin-serves-setup-doctor-and-update-and-writes-nothing.md) the three install commands.

## Install and update `wi`

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

At the current version, it installs nothing and still refreshes the skill and plugin copies. It leaves symlinked development installs alone. It does not create a missing plugin folder: install the plugin as [Install the plugin](../README.md#install-the-plugin) says. `--dry-run` writes nothing.

## Use with coding agents

`skills/recursive-board/SKILL.md` teaches an agent to read and change a vault through `wi`. `wi setup` installs copies into `~/.claude/skills/recursive-board/` and `~/.agents/skills/recursive-board/`. It leaves symlinked development installs alone and refuses to replace an unmanaged folder unless you pass `--force`. From a source checkout, `npm run install:skill` links the skill and `wi` into `~/.local/bin`.

The optional refocus hook sends a card's Objective chain after compaction or Claude transcript growth. Add its settings entries yourself to enable it.

Use `wi` for work-item changes. Do not edit work-item Markdown directly with scripts or bulk text tools. Use `wi validate` to check the vault after changes. `wi rm` moves items into `.trash`; removing a parent requires `--recursive`. Use `wi rm <ref> --dry-run` to review the affected items first.

A dispatcher runs `wi agents --json` before starting workers and holds off when `activeAgents` reaches `maxAgents`. Each agent counts while it works a doing card, so a card with two agents uses two places; a card whose open children are all in doing only waits, so it does not count; `null` means there is no configured limit. Set `WI_MAX_AGENTS` for a one-run override. The limit is advisory, and `wi claim` does not enforce it. A dispatcher leaves a card for any agent with `wi assign <ref> --to agent`, or starts an agent itself with its own harness's tools. The agent claims the card with `wi claim <ref>`, which names it by `WI_AGENT`, or with `--assignee <name>` (or `--holder <name>`). `wi claim` warns when the agent passes the limit, and it does not refuse. If that agent stops, the dispatcher runs `wi release <ref> --reason <text> [--where <branch-or-path>]` so the next worker can find the unfinished work. Keep a card in doing until its work is accepted.

A role is optional. It is a free tag such as `role/checker` on a card. A note that is not a work item and carries the same tag is that role's procedure, wherever the note lives. Roles do not pass down the tree. `wi validate` warns only when two notes carry one role tag (docs/adr/0062-role-tags.md).

## Assign a card

Assigning adds one name to the card's `assignee` and changes nothing else. The status stays: the assigner moves the card if it must move, or the assignee does when they start. A card can have several assignees, for example a person and an agent. One assignee is a plain value, `assignee: Ana`. Several are a list. The flag `--holder` still works in place of `--assignee`.

`wi assign <ref> --to <person>` adds a person. It writes no note; people explain a hand-off on the platform they talk on. The person is a name in the plugin's People setting, or a note with `type: person` in any folder, for example `People/Ana.md` ([People](configuration.md#people)). The name matches without case, and the card gets the spelling the vault knows. A person does not count toward `maxAgents`. Any other name is refused with one sentence that says to add the person in the plugin settings under People, so a typo cannot pass for an agent.

`wi assign <ref> --to agent` adds `agent`: any agent may take the card. It starts nothing and writes no note. The first agent's `wi claim` replaces `agent` with its own name and keeps the other assignees. `wi ready` lists a card whose only assignee is `agent` first. A card with any other assignee is taken, so a person who wants an agent on their card assigns `agent` and starts the agent with the card id. A person note called `agent` is refused, because the name is reserved, and the People setting refuses the name too.

`wi assign <ref> --to <name> --off` removes one assignee and leaves the status. `wi release` also removes one assignee, writes a note, and moves the card to options when no named assignee remains. In the plugin, **Assign to…** in the card menu adds a person or an agent, and **Unassign** removes one. When the device has **Your name**, **Assign to…** lists **Assign to me** first. The card shows the first assignee's initial and `+N` for the others. The assignee chip on a card face reads `Assigned to <names>` on hover, and the assignee pill in the open card header reads `Assigned to <names>`.

The plugin makes no rule about who may assign whom: no check, no permission, and no required level or title. A team may use the levels of the tree as it likes, for example the assignee one level down as the owner. The plugin does not check that convention.

wi starts no agent. Your harness starts agents with its own tools: a subagent, a background task, or another session. Give the agent the card id. It reads its brief with `wi show <ref> --json`: the card, the Objective of each ancestor, the Knowledge links, and each role tag with the notes that carry it. Then it claims the card by its own name, writes signed notes, and asks for review with `wi depend <ref> --on <person>` (docs/adr/0063-wi-starts-no-agents.md).

`wi note` signs with `WI_AGENT` or `--agent`, and adds `WI_MODEL` when set. It refuses to write without a writer name. `--role <name>` on `wi assign` adds the tag `role/<name>` with the assignee.
