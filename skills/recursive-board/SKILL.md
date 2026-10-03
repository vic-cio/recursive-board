---
name: recursive-board
description: Read and change work items in a Recursive Board vault through the `wi` CLI. Use when asked what is on a board, backlog or agenda; to add, tick, move, archive or remove a card; to break work into child items; or to take on and work a card. Also use whenever the working directory holds a `Boards/` folder.
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

`wi` finds the vault in this order: `--vault <path>`, `$WI_VAULT`, the vault the working
directory is in (the nearest folder above it that holds `Boards/` or the plugin data file), then
`defaultVault` in `~/.config/wi/config.json` (or `$XDG_CONFIG_HOME/wi/config.json`).

A project's `AGENTS.md` names its board. Pass that board to `wi new` as `--parent`, and to
`wi children`. Without `--parent`, `wi new` uses `defaultRoot` from the board settings.

`wi --help` is the full command reference. Read it for any flag this page does not name.

## Vault config

The board settings live in the Recursive Board plugin settings tab.
The plugin stores them under the `board` key of `.obsidian/plugins/recursive-board/data.json`.
`wi` reads them there and never writes them. Do not edit that file while Obsidian runs.
Read the README for each setting.

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
`wi objective` is retired. Use `wi show <ref> --json` to read a card and its ancestor objectives.
Before work, read the notes in the card's Knowledge section.

## Writing

```bash
wi new "<title>" --parent <ref> --objective <text> --context <text> --criteria <text> --criteria <text>
                 [--status backlog] [--priority <n>]   # 1 is the highest
                 [--template work-item|first-board-card|area]
wi status <ref> <backlog|options|doing|done>
wi note <ref> "<result>" [--agent <name>]   # signs with --agent or WI_AGENT
wi depend <ref> --on <ref>            # the card waits on another card; --off removes it
wi new <title> [--tag <tag>]... [--holder <name>]   # add tags; name who does the work
wi set <ref> --owner <name>                     # change who owns it; --role "" removes an old role field
wi area <ref>                         # mark a card as an area
wi area <ref> --off                   # remove the area mark
wi tag <ref> <tag>                    # add a free tag; --off removes it
wi claim <ref> [--holder <name>]     # you become the holder (WI_AGENT) and the card moves to doing
wi review <ref> --to <person> [--files <path>]... [--note <text>]  # send the card to a person for review
wi approve <ref> --you <person>      # the reviewer's verdict: note it and move the card to done
wi send-back <ref> --you <person> [--comment <text>]  # note it, remove owner; the card stays in doing
wi delegate <ref> --to <person>      # make a person (a type: person note) the holder; status stays
wi delegate <ref> --to agent         # leave the card for any agent (holder: agent); starts nothing
wi show <ref> --json                 # the brief: card, ancestor Objectives, Knowledge, role procedures
wi release <ref> --reason <text> [--where <branch-or-path>]
wi move <ref> --to <new parent ref>
wi archive <ref>                    # --undo reverses it
wi promote <ref>                    # render this item's children as a board
wi demote <ref>                     # render this item's children as a checklist
wi rm <ref> --recursive --dry-run   # read what it lists, then run it without --dry-run
```

`wi new --template` chooses the body for a new work item. Its names are `work-item`, `first-board-card`, and `area`.

`wi template` is retired. It exits with code 0 and tells you to use `wi new --template`.

In Obsidian, use **Promote** at the top of any child card to give it its own board, even before it has children. The child-count line at the top of a note jumps to its checklist below the body.

- Write a new title as an imperative phrase that names its subject ("Price the demolition lines
  for 35b", not "Price demolition"). It becomes the filename. `wi` turns unsafe characters into
  hyphens and adds the id to a clashing filename, and says so.
- Give every new card its brief in the `wi new` command: one `--objective`, a `--context` per
  source or fact, a `--criteria` per checkable result. `wi` warns when the brief is missing.
- A new card does not inherit its parent's owner. Pass `--owner` to set an owner on a `wi new` card.
- The board's add row also creates a child without an owner. Accountability follows the parent tree.
- Record progress with `wi note`. It locks the card, so a dispatcher and its worker can write
  at the same moment. Set `WI_AGENT` or pass `--agent` before writing. Leave the frontmatter to `wi`.
- The first child a card gets turns the card into a board, unless the vault sets
  `autoPromote: false`.
- To untick a done item, set it back to its `prev_status`.
- `wi area <ref>` marks the item as an area and keeps its status. It removes `prev_status` and refuses a card with a holder. Convert it back with `wi area <ref> --off`; its status stays the same.
- A card's `holder` names the person or agent who does its work. An old card's `agent` is read as
  its holder. `holder: agent` asks for any agent: `wi ready` lists those cards first, and your
  claim replaces `agent` with your name.
- A dispatcher claims cards from options for its workers. `wi claim` refuses a card held by a
  different holder, a done card, or a board with a child in doing that someone else works. `wi claim`
  and `wi status <ref> doing` refuse a card with an open dependency. `wi children` marks it
  `[waits on N]`, and `wi status <ref> done` names each card it unblocks. When work must wait for
  another card, record it with `wi depend <card> --on <other>`, not in prose. One
  agent can hold a card and its current subtask. A repeat by the same agent in doing writes nothing.
- `wi status <ref> done` says when that was the parent's last open child. Check the parent's own
  criteria, then close it.
- Before it starts an agent, a dispatcher reads `wi dashboard --panel agents`. It counts agents, not cards, and lists
  each agent's doing cards. A card whose open children are all in doing only waits, so it does not
  make its agent count. The dispatcher holds off when `activeAgents` reaches `maxAgents`;
  `null` means no limit is set. `WI_MAX_AGENTS` overrides the vault setting for one run. This
  limit is advisory: `wi claim` does not enforce it.
- To report the state of the boards to a person, run `wi dashboard --you <name> --json`. It
  returns what the person's dashboard shows: review work, progress, claims and attention.
- wi starts no agent. To hand a card to a worker, start the worker with your own harness's tools
  (a subagent, a background task, another session) and give it the card id. Write the brief on
  the card first: the worker reads it with `wi show <card> --json`, and claims the card by its own
  name. In a Git repo, give the worker its own branch or worktree.
  To assign a card to a person, use `wi delegate <card> --to <name>` with a note of
  `type: person`; the card does not count in the dashboard Agents panel. To leave a card for any
  agent, use `--to agent`. Delegating sets the holder and nothing else; the status stays.
- A dispatcher records each event on the card (start, finish, retry, stop) with
  `wi note <card> "<event>" --agent <its name>`.
- When a worker stops, its dispatcher runs `wi release` with a reason and, when available, the
  branch or worktree path. Release clears the holder, returns the card to options, and records the
  continuation location in Notes.
- Old `area/...` tags stay on existing cards. The board hides them, and Tags… leaves them out.
- Add or remove a free tag with `wi tag <ref> <tag> [--off]`. It refuses old `area/` tags.
- Run `wi validate` after a batch of writes. Exit 0 is clean. Exit 1 lists what broke.

## Writing a card

A card has one deliverable. When a card names more than one, give each deliverable its own child
card with `wi new "<title>" --parent <card>` and its own brief. Do this when you write the card, or before you or a
worker start it. The children are the todo list: move each child to done when it is finished. The
parent is done when every child is done. A worker reads its card's open children as its scope, so
the board shows what is still open.

## Working under a dispatcher

A worker is an agent that a dispatcher (a script or another agent) started on one card, with its
harness's own tools. The owner
follows the work on the board, so the board is the live record of what each worker does now. Use
your own agent name everywhere `<me>` appears.

Set `WI_AGENT` to your name and `WI_MODEL` to your model, or pass `--holder` to `wi claim` and
`--agent` to `wi note`. `wi note` signs each line with your name and model. It refuses to write
with no writer name.
A role is a tag such as `role/checker` on your card. A note that is not a card and carries the
same tag is its procedure: `wi show <card> --json` lists it under `procedures`. Read and follow it.
Roles do not pass down from a parent, and a card with no role tag has no procedure beyond this
section. `wi delegate --role <name>` and `wi tag <ref> role/<name>` add one.

1. Claim the card: `wi claim <card>`. Your claim names you as holder and moves it to doing. Read
   its brief with `wi show <card> --json`, and its open children.
2. Split it before you start when it holds more than one deliverable. Make each step a child with
   a full brief: `wi new "<title>" --parent <card> --objective ... --criteria ...`. Set
   `--priority` when the order matters.
3. Work one child at a time, live:
   1. `wi claim <child>` before its work starts.
   2. Do the work.
   3. `wi note <child> "<result, and where it is>"`.
   4. `wi status <child> done`.
4. Note a decision or a blocker on the card as it happens, with `wi note`.
5. When the card's criteria are met, note the result and run `wi status <card> done`. When you
   cannot go on, run `wi release <card> --reason <why> --where <location>`.
6. Run `wi validate`.

The board is the log of the work, not a report written after it. Each claim comes before its
work, so a card sits in doing for as long as its work takes.

## Working a card

For `/recursive-board <card> <instruction>`, use the instruction to clarify the request and the
card's Objective, Context and Acceptance Criteria as the brief. These steps are for a session with
its owner present. In a Git repo, steps 3 to 5 use a branch; elsewhere, record where the result
is.

1. Find the board in the project's `AGENTS.md`. If it names none, ask once which board to use,
   and propose a line for `AGENTS.md` that names it.
2. Read the card body. If Objective or Acceptance Criteria is missing, write a proposed brief in
   the card and ask for approval; wait before doing the work.
3. Claim it with `wi claim <card> --holder <agent name>`. In a Git repo, work on a new
   `card/<slug>` branch, run the repo's tests and commit the result. Track subtasks as in
   "Working under a dispatcher", step 3.
4. If the work is too large or cannot finish, stop with a split proposal or continuation note in
   your report, then run `wi release <card> --reason <reason> --where <branch-or-path>`. Let the
   dispatcher decide whether to create child cards.
5. When finished, run `wi note <card> "<result, and its branch or location>"`. Leave the card in
   `doing` and stop for review. Merge, push and publish wait for the owner's verdict.

To send a card for review, use **Send for review…** in its card menu, or run `wi review <ref> --to
<person> [--files <path>]... [--note <text>]`. Choose a person note, and say what to check in the
note. Attach files or add links in the menu, or repeat `--files` in the CLI. Both writers set `owner` and append a `**Review:**` note in one write. The
dashboard lists the card under "For review" when its newest review note follows its last verdict
note, it has no open child, and it is not done. Any other column counts. When the note lists no file, or only
web addresses, the card's own row carries the tick for the verdict.

The reviewer gives the verdict with **Approve** or **Send back** on the dashboard, or with
`wi approve <ref> --you <person>` and `wi send-back <ref> --you <person> [--comment <text>]`. Both
writers make the same one write. `--you` must match the card's `owner`. `wi` refuses a card that
is not in doing, has no review request after its last verdict, or has an open child. Run a verdict
command only with the verdict the reviewer gave you. Never give a verdict on your own work. `wi`
signs the note with `WI_AGENT`, so the card shows who wrote it.

## Outcomes

`wi` prints the change it made, for example `wi-3k9p  Write the release notes  doing → done`.
Report that line to the user. A refusal (exit 2) names its reason. It is a rule doing its job:
read it and change the approach. Do not work around it with a file tool.
