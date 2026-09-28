# Recursive Board

> **Install with your agent.** Paste this prompt into your coding agent: "Check that Node.js 20.12 or later is installed, run `npm install --global recursive-board`, then run `wi setup`."

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

Optional fields include `owner`, `agent`, `priority`, `due`, `blocked`, `depends_on`, `tags`, and `archived`. Unknown frontmatter keys are preserved. `wi validate` reports them as warnings.

An item with `board: true` renders its children in status columns. Any other item renders its children as a checklist. The plugin reads the item's frontmatter and generates the view; the Markdown files remain the source of truth.

Every child card has a **Promote** control at the top, even before it has children. Promote it to give its own children a board. A one-line child count at the top jumps to the checklist below the note.

## Vault configuration

Place an optional `.wi.json` file at the vault root to choose the work-item folder, default parent, extra sections for new items, the dispatcher's advisory agent limit, and whether `wi new` promotes a parent:

```json
{
  "workItemFolder": "Boards",
  "defaultRoot": "Project",
  "extraSections": ["References", "Risks"],
  "maxAgents": 3,
  "autoPromote": true,
  "areaTags": false
}
```

`workItemFolder` is a vault-relative folder path. It defaults to `Boards`. `defaultRoot` is the filename stem of a root work item. It defaults to `null`, which means `wi new` needs an explicit `--parent`. `extraSections` is an array of non-empty, single-line headings. It defaults to `[]`. Each heading is added after the built-in template sections with an empty `- ` starter. The setting applies to `wi new`, `wi template write`, and items created in the plugin. Invalid values make `.wi.json` fail to load.

`maxAgents` is a non-negative whole number, or `null` for no limit. The plugin settings tab writes it to `.wi.json`. `WI_MAX_AGENTS` overrides it for one CLI run. `wi agents` prints the effective limit, the number of distinct agents with a card in doing, and each claimed doing card. An agent that holds a card and its current subtask counts once. The limit is advisory: dispatchers use the count to decide whether to start a worker, and `wi claim` still succeeds over the limit.

`autoPromote` is `true` or `false`. It defaults to `true`. When `wi new` gives a card its first child, it also sets `board: true` on that card, so the children show as a board. It never changes a root, an area, a card that already has children, or a card that has a `board` key. Items added in Obsidian are not promoted: a person who adds to a checklist chose a checklist.

`areaTags` is `true` or `false`. It defaults to `false`. When it is `true`, each work item under an area carries one tag that names its areas from the top down, such as `area/work/web-site`. `wi new` and the board's add row write it, `wi validate` warns when one is stale, and `wi retag` fixes them. `wi graph` turns the tags into graph colours. The board hides `area/` chips.

`wi setup` writes the selected vault to the user config at `$XDG_CONFIG_HOME/wi/config.json`, or `~/.config/wi/config.json` when `XDG_CONFIG_HOME` is unset. The format is `{"defaultVault":"/absolute/path/to/vault"}`. Vault detection uses Obsidian's registry on macOS, Linux, and Windows. `--vault <path>` selects a vault directly, and `--yes --vault <path>` runs without prompts.

`wi` finds the vault from `--vault <path>`, then `$WI_VAULT`, then the nearest folder with `.wi.json` or `Boards/`, then the current Git repo's pointer, then `defaultVault` in `~/.config/wi/config.json` (or `$XDG_CONFIG_HOME/wi/config.json`). Use `wi here --vault <path> --board <ref>` once in a repo to save its vault and board outside the repo. The pointer is keyed by Git's common directory, so linked worktrees share it. Run `wi here` to print the current repo's pointer.

## Start a board

### Create one in Obsidian

Enable Recursive Board in an empty vault. Use the **Create your first board** button in the notice, or run **Create your first board** from the command palette. Enter a name (the default is `Main`). The plugin creates the board, adds a starter card that explains how to move it, and opens the board.

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

2. Create `.wi.json` at the vault root with `{"defaultRoot": "Project"}`.
3. Add a card with `wi new "Write the first card"`.
4. Open `Project` in Obsidian. The plugin shows its children as a board.

## Dashboard

The ribbon's dashboard icon, or the command **Open dashboard**, opens one page over every board. Pick a root board to narrow it. It shows three panels:

- **For review.** Cards in doing that you own and that have no open child. Set your name in the plugin settings. A note that starts with `**Review:**` lists the files to check, as vault-relative paths in backticks. A name opens the file.
- **Progress.** Done cards out of all cards, for each top area. Click an area to see the areas inside it, and to narrow the other panels to it.
- **Agents.** Claimed cards for each area: working, idle for an hour, or recently finished.

## Install the Obsidian plugin

Once the plugin is listed in the Community plugins directory, open **Settings → Community plugins → Browse**, find **Recursive Board**, select **Install**, then enable it.

Before listing, you can install a release manually:

1. Download a release or build the project with `npm run build`.
2. Create a folder under the vault's plugin directory using the `id` in `manifest.json` as its name.
3. Copy `main.js`, `manifest.json`, and `styles.css` from that release or directly from `dist/` into it.
4. In Obsidian, open **Settings → Community plugins** and enable **Recursive Board**.

Reload Obsidian after replacing plugin files. If your vault syncs its `.obsidian` folder, the sync client can copy the installed plugin to your other devices. Sync behavior depends on that client's settings.

## Install `wi`

`wi` is the CLI package `recursive-board`. It requires Node.js 20.12 or later and installs the `wi` binary:

```sh
npm install --global recursive-board
wi --help
wi setup
```

Run `wi` inside a vault, pass `--vault <path>`, set `WI_VAULT`, or set a repo pointer with `wi here`. Commands accept a work-item id, filename, or title as a reference. An id takes precedence when references are ambiguous. Add `--json` for machine-readable output. The `--vault <path>` and `--json` flags apply to all commands. With a repo pointer, `wi new` uses its board when `--parent` is omitted, and `wi children` uses it when the reference is omitted.

## Use with coding agents

`skills/recursive-board/SKILL.md` teaches an agent to read and change a vault through `wi`. `wi setup` installs copies into `~/.claude/skills/recursive-board/` and `~/.agents/skills/recursive-board/`. It leaves symlinked development installs alone and refuses to replace an unmanaged folder unless you pass `--force`. From a source checkout, `npm run install:skill` links the skill and `wi` into `~/.local/bin`.

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
| `wi setup [--yes] [--vault <path>] [--force]` | Installs the agent skill, selects and saves a default vault, and offers the Git validation hook for a Git vault. `--yes` requires `--vault` and asks no questions. |
| `wi new <title> [--parent <ref>] [--status <status>] [--template <name>] [--owner <name>] [--agent <name>] [--priority <number>] [--objective <text>] [--context <text>]... [--criteria <text>]... [--strict]` | Creates a work item under the given parent. If `--parent` is omitted, uses the repo pointer's board, then `defaultRoot` from `.wi.json`. The brief flags fill the body: repeat `--context` for each paragraph and `--criteria` for each criterion. It warns when the card has no Objective or Acceptance Criteria, and `--strict` refuses the card instead. Unsafe filename characters in the title become hyphens; a filename clash adds the id suffix and never overwrites. See `autoPromote`. |
| `wi status <ref> <status>` | Changes an item's status. Use `backlog`, `options`, `doing`, or `done`. Leaving `done` clears the recorded previous status. When the item was its parent's last open child, it says so; it does not close the parent. |
| `wi note <ref> <text> [--agent <name>]` | Appends `- <date> <time>, <agent>: <text>` under the card's Notes. The agent defaults to the card's agent. The write re-reads the card under a lock, so two notes at the same moment both survive. |
| `wi new … [--creator <name>] [--model <id>] [--role <name>]` | Records who made the card and which role does its work, as the plain names of person and role notes (any folder), so the graph gets no edge to them. `--creator` and `--model` fall back to `WI_CREATOR` and `WI_MODEL`. `wi new` warns when a card has no creator; `--strict` refuses it. `wi note` then names its writer as "Role (model)". |
| `wi set <ref> [--owner <name>] [--role <name>] [--creator <name> [--model <id>]]` | Changes a card's owner or role (an empty value removes it). Writes the creator and model only when the card has none: a creator is set once. |
| `wi depend <ref> --on <ref> [--off]` | Makes a card wait on another card, or with `--off` stops it. `wi claim` and `wi status <ref> doing` refuse a card that waits on a card that is not done. The board allows it and shows a notice. `wi status <ref> done` names each card that can start now. |
| `wi area <ref> [--off]` | Marks a card as an area or removes the area mark. The current status stays in place. Conversion refuses a card with an agent. |
| `wi claim <ref> --agent <name>` | Claims a card for an agent and moves it to doing in one write. Refuses a different agent, a done card, or a board with a child in doing that another agent or a person works. It also refuses a card with `blocked: true`, which `wi children` marks `[blocked]`. An agent can hold a card and its current subtask at once. Repeating an active claim by the same agent writes nothing. |
| `wi agents` | Prints the configured agent limit, the number of distinct agents with a card in doing, and each claimed doing card. `--json` returns `maxAgents`, `activeAgents` and `claims`. |
| `wi release <ref> --reason <text> [--where <branch-or-path>]` | Clears the agent, moves the card to options, and adds a dated line to Notes with the reason and optional work location. Refuses an unclaimed card. |
| `wi move <ref> --to <ref>` | Changes the item's parent. Its status stays the same, and its children move with it. |
| `wi archive <ref> [--undo]` | Archives an item. `--undo` unarchives it. Archived items are hidden from normal reads; descendants are hidden with an archived parent. |
| `wi retag [--dry-run]` | Needs `areaTags`. Gives every work item the area tag its place in the tree calls for, and removes stale ones. Run it after `wi move` or `wi area`; both say when tags are stale. |
| `wi graph` | Needs `areaTags`. Writes two colour groups per area into `.obsidian/graph.json`: a shade for boards and areas, and a lighter one for cards. A sub-area is a lighter shade of its top area. Your own groups stay, after the area groups. Close the graph view first, because Obsidian may write over the file. |
| `wi promote <ref>` / `wi demote <ref>` | Makes an item a board or a card again. Promotion sets `board: true`; demotion removes the `board` key. |
| `wi rm <ref> [--recursive] [--dry-run]` | Moves an item to the vault's `.trash` folder. Use `--dry-run` to preview. Items with children require `--recursive`. |
| `wi children [<ref>] [--status <status>] [--tree] [--archived]` | Lists an item's children. If the ref is omitted, uses the repo pointer's board. `--status` filters by status, `--tree` shows descendants, and `--archived` includes archived items. |
| `wi validate` | Checks work-item structure and reports errors and warnings. Exits with code 1 when it finds errors. |
| `wi hook install\|uninstall\|status [--vault <path>]` | Installs, removes, or inspects the Git pre-commit validation hook. `install --force` replaces an unrelated hook. |
| `wi here [--board <ref>] [--vault <path>]` | Prints this Git repo's pointer, or sets it in user config. Linked worktrees share the pointer. |

| `wi template [list\|write]` | Lists available templates, or writes the code's templates into `Templates/` with `wi template write`. Defaults to `list`. |
| `wi --help` or `wi help` | Prints usage, options, and notes. |
| `wi --version` | Prints the installed CLI version. |

`wi new --template area` creates an area in `backlog` by default. Pass `--status` to choose its
starting status. Areas appear in their status column. Areas in options or doing also appear in the area bar; a backlog or done area stays in its column only.

`wi move`, `wi rm`, and `wi archive` refuse to run when a hidden non-Markdown file is in the work-item folder. The index cannot read that file, so it may be missing a work item. Let the sync client finish downloading it or remove the stray file, then retry. There is no force option. `wi new` still creates the item and warns on stderr because a new id or filename may clash with an unread file. `wi validate` reports a warning if `defaultRoot` names no root item.

## For agents

Use `wi` for work-item changes. Do not edit work-item Markdown directly with scripts or bulk text tools. Use `wi validate` to check the vault after changes. `wi rm` moves items into `.trash`; removing a parent requires `--recursive`. Use `wi rm <ref> --dry-run` to review the affected items first.

A dispatcher runs `wi agents` before starting workers and holds off when `activeAgents` reaches `maxAgents`; `null` means there is no configured limit. Set `WI_MAX_AGENTS` for a one-run override. The limit is advisory, and `wi claim` does not enforce it. A dispatcher assigns a card with `wi claim <ref> --agent <name>`. If that worker stops, the dispatcher runs `wi release <ref> --reason <text> [--where <branch-or-path>]` so the next worker can find the unfinished work. Keep a card in doing until its work is accepted.

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
