---
name: recursive-board
description: Read and change work items in a Recursive Board vault through the `wi` CLI. Use when asked what is on a board, backlog or agenda; to add, tick, move, archive or remove a card; to break work into child items; or to take on and work a card. Also use whenever the working directory holds a `Boards/` folder, a `Recursive Board config.md` note, or a legacy `.wi.json` file.
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
working directory that holds `Recursive Board config.md`, `.wi.json`, or `Boards/`, this Git repo's pointer, then
`defaultVault` in `~/.config/wi/config.json` (or `$XDG_CONFIG_HOME/wi/config.json`). To set a
repo pointer, run `wi here --vault <path> --board <ref>` once from that repo. It is stored in
user config outside the repo, keyed by Git's common directory, so linked worktrees share it.
Run `wi here` to print the current repo's pointer. With a pointer, `wi new` defaults to its board
and `wi children` can omit the reference. Explicit `--parent` and `wi children <ref>` still work.

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
wi children                       # use the repo pointer's board
```

Add `--json` when you parse the result. A card's own text (objective, criteria, notes) is in
its file in the work-item folder (`Boards/` by default). Read the file.

## Writing

```bash
wi new "<title>" --parent <ref> --objective <text> --context <text> --criteria <text> --criteria <text>
                 [--status backlog] [--priority <n>]   # 1 is the highest
wi status <ref> <backlog|options|doing|done>
wi note <ref> "<result>" [--agent <name>]   # one dated line under Notes
wi depend <ref> --on <ref>            # the card waits on another card; --off removes it
wi new <title> --creator <role> --model <id> [--role <role>]  # who made it, which role does it
                                                              # no --role: the nearest ancestor's role
wi set <ref> --owner <name> | --role <role>                   # change who owns it or does it
wi area <ref>                         # mark a card as an area
wi area <ref> --off                   # remove the area mark
wi tag <ref> <tag>                    # add a free tag; --off removes it
wi claim <ref> --agent <name>        # assign and move to doing in one write
wi delegate <ref> --to <person>      # assign to a person (a type: person note); status stays
wi delegate <ref> --to <claude|codex|pi> [--model <id>]  # start a headless worker on the card's brief
wi release <ref> --reason <text> [--where <branch-or-path>]
wi move <ref> --to <new parent ref>
wi archive <ref>                    # --undo reverses it
wi promote <ref>                    # render this item's children as a board
wi demote <ref>                     # render this item's children as a checklist
wi rm <ref> --recursive --dry-run   # read what it lists, then run it without --dry-run
```

In Obsidian, use **Promote** at the top of any child card to give it its own board, even before it has children. The child-count line at the top of a note jumps to its checklist below the body.

- Write a new title as an imperative phrase that names its subject ("Price the demolition lines
  for 35b", not "Price demolition"). It becomes the filename. `wi` turns unsafe characters into
  hyphens and adds the id to a clashing filename, and says so.
- Give every new card its brief in the `wi new` command: one `--objective`, a `--context` per
  source or fact, a `--criteria` per checkable result. `wi` warns when the brief is missing.
- A new card does not inherit its parent's owner. Pass `--owner` to set an owner on a `wi new` card.
- The board's add row also creates a child without an owner. Accountability follows the parent tree.
- Record progress with `wi note`. It locks the card, so a dispatcher and its worker can write
  at the same moment. Leave the frontmatter to `wi`.
- The first child a card gets turns the card into a board, unless the vault sets
  `autoPromote: false`.
- To untick a done item, set it back to its `prev_status`.
- `wi area <ref>` marks the item as an area and keeps its status. It removes `prev_status` and refuses a card with an agent. Convert it back with `wi area <ref> --off`; its status stays the same.
- A dispatcher claims cards from options for its workers. `wi claim` refuses a card claimed by a
  different agent, a done card, a `blocked: true` card, or a board with a child in doing that
  someone else works. `wi children` marks a blocked card `[blocked]`. `wi claim` and `wi status
  <ref> doing` also refuse a card that waits on a card that is not done; `wi children` marks it
  `[waits on N]`, and `wi status <ref> done` names each card it unblocks. When work must wait for
  another card, record it with `wi depend <card> --on <other>`, not in prose. One
  agent can hold a card and its current subtask. A repeat by the same agent in doing writes nothing.
- `wi status <ref> done` says when that was the parent's last open child. Check the parent's own
  criteria, then close it.
- Before starting a worker, a dispatcher runs `wi agents`. It counts agents, not cards, and lists
  each agent's doing cards. The dispatcher holds off when `activeAgents` reaches `maxAgents`;
  `null` means no limit is set. `WI_MAX_AGENTS` overrides the vault setting for one run. This
  limit is advisory: `wi claim` does not enforce it.
- To report the state of the boards to a person, run `wi dashboard --you <name> --json`. It
  returns what the person's dashboard shows: review work, progress, claims and attention.
- To hand a card to a worker, run `wi delegate <card> --to <harness> --model <id>`. The worker
  reads the card body as its brief, so write the brief on the card first.
  It makes a worktree of the current Git repository on `card/<slug>`, claims the card for the
  worker, starts the harness with the card body as the brief, and notes the log path. Run it in the
  repository the card works on. To assign a card to a person, use `--to <name>` with a note of
  `type: person`. It sets only `agent`, so the person starts when they choose, and the card does
  not count in `wi agents`.
- A dispatcher records each event on the card (start, finish, retry, stop) with
  `wi note <card> "<event>" --agent <its name>`.
- When a worker stops, its dispatcher runs `wi release` with a reason and, when available, the
  branch or worktree path. Release clears the agent, returns the card to options, and records the
  continuation location in Notes.
- If the vault sets `areaTags`, `wi` keeps an `area/...` tag on each card. Leave it to `wi`. After
  `wi move` or `wi area`, run `wi retag`.
- Add or remove any other tag with `wi tag <ref> <tag> [--off]`. It refuses an `area/` tag.
- Run `wi validate` after a batch of writes. Exit 0 is clean. Exit 1 lists what broke.

## Writing a card

A card has one deliverable. When a card names more than one, give each deliverable its own child
card with `wi new "<title>" --parent <card>` and its own brief. Do this when you write the card, or before you or a
worker start it. The children are the todo list: move each child to done when it is finished. The
parent is done when every child is done. A worker reads its card's open children as its scope, so
the board shows what is still open.

## Working under a dispatcher

A worker is an agent that a dispatcher (a script or another agent) started on one card. The owner
follows the work on the board, so the board is the live record of what each worker does now. Use
your own agent name everywhere `<me>` appears.

The dispatcher sets `WI_CREATOR` to your role and `WI_MODEL` to your model, so every card you
make and every note you write names you. If they are unset, pass `--creator <role> --model <id>`
to `wi new`. When the card has a `role`, read that role note: it is your procedure. In a live
session with the owner, your role is the vault's session role note, if it has one. A child you
make copies the role of its nearest ancestor that has one. Pass `--role <role>` only when the
step needs a different procedure.

1. Claim the card: `wi claim <card> --agent <me>`. Read its body and its open children.
2. Split it before you start when it holds more than one deliverable. Make each step a child with
   a full brief: `wi new "<title>" --parent <card> --objective ... --criteria ...`. Set
   `--priority` when the order matters.
3. Work one child at a time, live:
   1. `wi claim <child> --agent <me>` before its work starts.
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

1. Resolve the vault and board from the repo map (`wi here`). If the repo has no entry, ask once
   which board to use, then record it with `wi here --board <board> --vault <vault>`.
2. Read the card body. If Objective or Acceptance Criteria is missing, write a proposed brief in
   the card and ask for approval; wait before doing the work.
3. Claim it with `wi claim <card> --agent <agent name>`. In a Git repo, work on a new
   `card/<slug>` branch, run the repo's tests and commit the result. Track subtasks as in
   "Working under a dispatcher", step 3.
4. If the work is too large or cannot finish, stop with a split proposal or continuation note in
   your report, then run `wi release <card> --reason <reason> --where <branch-or-path>`. Let the
   dispatcher decide whether to create child cards.
5. When finished, run `wi note <card> "<result, and its branch or location>"`. Leave the card in
   `doing` and stop for review. Merge, push and publish wait for the owner's verdict.

To hand a card to a person for review, leave it in `doing` with `owner` set to their name. Then
write a note that starts with `**Review:**`, says what to check, and lists each file to open as a
vault-relative path in backticks. The plugin's dashboard lists the card under "For review" when
it has no open child. When the note lists no file, or only web addresses, the card's own row
carries the tick for the verdict.

```bash
wi note <card> '**Review:** Check the totals: `Work/quote.xlsx`'
```

## Outcomes

`wi` prints the change it made, for example `wi-3k9p  Write the release notes  doing → done`.
Report that line to the user. A refusal (exit 2) names its reason. It is a rule doing its job:
read it and change the approach. Do not work around it with a file tool.
