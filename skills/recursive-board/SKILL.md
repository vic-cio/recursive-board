---
name: recursive-board
description: Read and change work items in a Recursive Board vault through the `wi` CLI. Use when asked what is on a board, backlog or agenda; to add, tick, move, archive or remove a card; or to break work into child items. Also use whenever the working directory holds a `Boards/` folder or a `.wi.json` file.
---

# recursive-board

A Recursive Board vault stores each work item as one Markdown file. `wi` is the only writer that
knows the rules, so make every change to a work item through it. The Obsidian plugin and `wi`
apply the same rules, so a change made here matches a change made by hand on the board.

## Setup

After installing the `recursive-board` npm package, run `wi setup` once. It copies this skill to
both `~/.claude/skills/recursive-board/` and `~/.agents/skills/recursive-board/`, detects vaults
from Obsidian's registry, and saves the selected default vault. Use `wi setup --vault <path>` to
select a vault directly, or `wi setup --yes --vault <path>` for unattended setup. Setup keeps
symlinked development installs and refuses to replace an unmanaged skill folder unless passed
`--force`.

## Before the first write

If the vault root has an `AGENTS.md`, read it. The vault owner's rules there (what you may
delete, how to name cards) take priority over this page.

## Reaching the vault

`wi` finds the vault in this order: `--vault <path>`, then `$WI_VAULT`, then the nearest folder
above the working directory that holds `.wi.json` or `Boards/`. Outside the vault, pass
`--vault <path>` on every call or set `WI_VAULT`.

`wi --help` is the full command reference. Read it for any flag this page does not name.

## Reading

A `<ref>` is an id (`wi-3k9p`), a filename, or a title. Use the id once you have it: it is exact
and survives a rename.

```bash
wi children <root> --tree          # the whole tree under a root item
wi children <ref>                  # one board, grouped by status
wi children <ref> --status doing   # one column
```

Add `--json` when you parse the result. A card's own text (objective, criteria, notes) is in
its file in the work-item folder (`Boards/` by default). Read the file.

## Writing

```bash
wi new "<title>" --parent <ref> [--status backlog] [--priority <n>]   # 1 is the highest
wi status <ref> <backlog|options|doing|done>
wi claim <ref> --agent <name>        # assign and move to doing in one write
wi release <ref> --reason <text> [--where <branch-or-path>]
wi move <ref> --to <new parent ref>
wi archive <ref>                    # --undo reverses it
wi rm <ref> --recursive --dry-run   # read what it lists, then run it without --dry-run
```

- Write a new title as an imperative phrase. It becomes the filename, so make it unique.
- `wi new` writes the frontmatter and the template sections. Fill the body sections with a file
  edit afterwards. Leave the frontmatter to `wi`.
- To untick a done item, set it back to its `prev_status`.
- A dispatcher claims cards from options for its workers. `wi claim` refuses a card claimed by a
  different agent, a done card, or a board with a child in doing. A repeat by the same agent in
  doing writes nothing.
- When a worker stops, its dispatcher runs `wi release` with a reason and, when available, the
  branch or worktree path. Release clears the agent, returns the card to options, and records the
  continuation location in Notes.
- Run `wi validate` after a batch of writes. Exit 0 is clean. Exit 1 lists what broke.

## Outcomes

`wi` prints the change it made, for example `wi-3k9p  Write the release notes  doing → done`.
Report that line to the user. A refusal (exit 2) names its reason. It is a rule doing its job:
read it and change the approach. Do not work around it with a file tool.
