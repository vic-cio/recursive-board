# Recursive Board

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

Optional fields include `owner`, `agent`, `priority`, `due`, `blocked`, `depends_on`, `tags`, and `archived`. Unknown frontmatter keys are preserved. `wi validate` reports them as warnings.

An item with `board: true` renders its children in status columns. Any other item renders its children as a checklist. The plugin reads the item's frontmatter and generates the view; the Markdown files remain the source of truth.

## Vault configuration

Place an optional `.wi.json` file at the vault root to choose the work-item folder and the default parent for new items:

```json
{
  "workItemFolder": "Boards",
  "defaultRoot": "Project"
}
```

`workItemFolder` is a vault-relative folder path. It defaults to `Boards`. `defaultRoot` is the filename stem of a root work item. It defaults to `null`, which means `wi new` needs an explicit `--parent`.

`wi` finds the vault from `--vault <path>`, then `$WI_VAULT`, then the nearest folder with `.wi.json` or `Boards/`.

## Install the Obsidian plugin

The plugin is not yet in the Obsidian Community plugins directory. Install it manually:

1. Download a release or build the project with `npm run build`.
2. Create `.obsidian/plugins/recursive-board/` in your vault.
3. Copy `main.js`, `manifest.json`, and `styles.css` from `dist/recursive-board/` into that folder.
4. In Obsidian, open **Settings → Community plugins** and enable **Recursive Board**.

Reload Obsidian after replacing plugin files. If your vault syncs its `.obsidian` folder, the sync client can copy the installed plugin to your other devices. Sync behavior depends on that client's settings.

## Install `wi`

`wi` is the CLI package `recursive-board`. It requires Node.js 20.12 or later and installs the `wi` binary:

```sh
npm install --global recursive-board
wi --help
```

Run `wi` inside a vault, pass `--vault <path>`, or set `WI_VAULT`. Commands accept a work-item id, filename, or title as a reference. An id takes precedence when references are ambiguous. Add `--json` for machine-readable output. The `--vault <path>` and `--json` flags apply to all commands.

## Commands

| Command | What it does |
| --- | --- |
| `wi new <title> [--parent <ref>] [--status <status>] [--template <name>] [--owner <name>] [--agent <name>] [--priority <number>]` | Creates a work item under the given parent. If `--parent` is omitted, uses `defaultRoot` from `.wi.json`. |
| `wi status <ref> <status>` | Changes an item's status. Use `backlog`, `options`, `doing`, or `done`. Leaving `done` clears the recorded previous status. |
| `wi move <ref> --to <ref>` | Changes the item's parent. Its status stays the same, and its children move with it. |
| `wi archive <ref> [--undo]` | Archives an item. `--undo` unarchives it. Archived items are hidden from normal reads; descendants are hidden with an archived parent. |
| `wi rm <ref> [--recursive] [--dry-run]` | Moves an item to the vault's `.trash` folder. Use `--dry-run` to preview. Items with children require `--recursive`. |
| `wi children <ref> [--status <status>] [--tree] [--archived]` | Lists an item's children. `--status` filters by status, `--tree` shows descendants, and `--archived` includes archived items. |
| `wi validate` | Checks work-item structure and reports errors and warnings. Exits with code 1 when it finds errors. |
| `wi template [list\|write]` | Lists available templates, or writes the code's templates into `Templates/` with `wi template write`. Defaults to `list`. |
| `wi --help` or `wi help` | Prints usage, options, and notes. |
| `wi --version` | Prints the installed CLI version. |

`wi move` and `wi rm` refuse to run when a hidden non-Markdown file is in the work-item folder. The index cannot read that file, so it may be missing a work item. Let the sync client finish downloading it or remove the stray file, then retry. There is no force option.

## For agents

Use `wi` for work-item changes. Do not edit work-item Markdown directly with scripts or bulk text tools. Use `wi validate` to check the vault after changes. `wi rm` moves items into `.trash`; removing a parent requires `--recursive`. Use `wi rm <ref> --dry-run` to review the affected items first.

## Development

Requirements: Node.js 20.12 or later and npm.

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
