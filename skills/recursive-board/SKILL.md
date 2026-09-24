---
name: recursive-board
description: Read and change work items in a Recursive Board vault through the `wi` CLI. Use when asked what is on a board, backlog or agenda; to add, tick, move, archive or remove a card; to break work into child items; or to take on and work a card. Also use whenever the working directory holds a `Boards/` folder or a `.wi.json` file.
---

# recursive-board

A Recursive Board vault stores each work item as one Markdown file. `wi` owns work-item metadata
and applies the same rules as the Obsidian plugin. Edit card body text directly when the workflow
below calls for it.

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

`wi` finds the vault in this order: `--vault <path>`, `$WI_VAULT`, the nearest folder above the
working directory that holds `.wi.json` or `Boards/`, this Git repo's pointer, then
`defaultVault` in `~/.config/wi/config.json` (or `$XDG_CONFIG_HOME/wi/config.json`). To set a
repo pointer, run `wi here --vault <path> --board <ref>` once from that repo. It is stored in
user config outside the repo, keyed by Git's common directory, so linked worktrees share it.
Run `wi here` to print the current repo's pointer. With a pointer, `wi new` defaults to its board
and `wi children` can omit the reference. Explicit `--parent` and `wi children <ref>` still work.

`wi --help` is the full command reference. Read it for any flag this page does not name.

## Reading

A `<ref>` is an id (`wi-3k9p`), a filename, or a title. Use the id once you have it: it is exact
and survives a rename.

```bash
wi children <root> --tree          # the whole tree under a root item
wi children <ref>                  # one board, grouped by status
wi children <ref> --status doing   # one column
wi children                       # use the repo pointer's board
```

Add `--json` when you parse the result. A card's own text (objective, criteria, notes) is in
its file in the work-item folder (`Boards/` by default). Read the file.

## Writing

```bash
wi new "<title>" --parent <ref> [--status backlog] [--priority <n>]   # 1 is the highest
wi status <ref> <backlog|options|doing|done>
wi area <ref>                         # mark a card as an area
wi area <ref> --off                   # remove the area mark
wi claim <ref> --agent <name>        # assign and move to doing in one write
wi release <ref> --reason <text> [--where <branch-or-path>]
wi move <ref> --to <new parent ref>
wi archive <ref>                    # --undo reverses it
wi promote <ref>                    # render this item's children as a board
wi demote <ref>                     # render this item's children as a checklist
wi rm <ref> --recursive --dry-run   # read what it lists, then run it without --dry-run
```

In Obsidian, use **Promote** at the top of any child card to give it its own board, even before it has children. The child-count line at the top of a note jumps to its checklist below the body.

- Write a new title as an imperative phrase. It becomes the filename, so make it unique.
- `wi new` writes the frontmatter and the template sections. Fill the body sections with a file
  edit afterwards. Leave the frontmatter to `wi`.
- To untick a done item, set it back to its `prev_status`.
- `wi area <ref>` marks the item as an area and keeps its status. It removes `prev_status` and refuses a card with an agent. Convert it back with `wi area <ref> --off`; its status stays the same.
- A dispatcher claims cards from options for its workers. `wi claim` refuses a card claimed by a
  different agent, a done card, or a board with a child in doing. A repeat by the same agent in
  doing writes nothing.
- Before starting a worker, a dispatcher runs `wi agents`. It holds off when `activeAgents`
  reaches `maxAgents`; `null` means no limit is set. `WI_MAX_AGENTS` overrides the vault setting
  for one run. This limit is advisory: `wi claim` does not enforce it.
- When a worker stops, its dispatcher runs `wi release` with a reason and, when available, the
  branch or worktree path. Release clears the agent, returns the card to options, and records the
  continuation location in Notes.
- Run `wi validate` after a batch of writes. Exit 0 is clean. Exit 1 lists what broke.

## Writing a card

A card has one deliverable. When a card names more than one, give each deliverable its own child
card with `wi new "<title>" --parent <card>`. Do this when you write the card, or before you or a
worker start it. The children are the todo list: move each child to done when it is finished. The
parent is done when every child is done. A worker reads its card's open children as its scope, so
the board shows what is still open.

## Working a card

For `/recursive-board <card> <instruction>`, use the instruction to clarify the request and the
card's Objective, Context and Acceptance Criteria as the brief:

1. Resolve the vault and board from the repo map (`wi here`). If the repo has no entry, ask once
   which board to use, then record it with `wi here --board <board> --vault <vault>`.
2. Read the card body. If Objective or Acceptance Criteria is missing, write a proposed brief in
   the card and ask for approval; wait before doing the work.
3. Claim it with `wi claim <card> --agent <agent name>`. Work in the current repo on a new
   `card/<slug>` branch. Run the repo's tests and commit the result.
4. If the work is too large or cannot finish, stop with a split proposal or continuation note in
   your report, then run `wi release <card> --reason <reason> --where <branch-or-path>`. Let the
   dispatcher decide whether to create child cards.
5. When finished, add one dated line under the card's Notes with the branch and result. Leave the
   card in `doing` and stop for review. Do not merge or push; those wait for the owner's verdict.

## Outcomes

`wi` prints the change it made, for example `wi-3k9p  Write the release notes  doing → done`.
Report that line to the user. A refusal (exit 2) names its reason. It is a rule doing its job:
read it and change the approach. Do not work around it with a file tool.
