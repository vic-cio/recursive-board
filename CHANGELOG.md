# Changelog

This file lists the changes in each release of the Recursive Board plugin and `wi`. It follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions follow
[Semantic Versioning](https://semver.org/).

A release that changes what agents are told to do has an "Agent setup" section first. That
section covers the skill, roles, delegation and the review loop. Read it before you update
the agent notes in your vault.

## [Unreleased]

### Agent setup

- The agent playbook is removed, and no document recommends an agent setup. Role notes, a
  Dispatching note and an `AGENTS.md` section that you copied from it stay yours: keep, change or
  delete them. `wi doctor` no longer checks them, and `wi setup` no longer prints a summary of the
  playbook ([0081](docs/adr/0081-the-docs-explain-the-tools-and-ship-no-agent-playbook.md)).
- The refocus hook doc is removed from the repo. The hook and its settings do not change
  ([0081](docs/adr/0081-the-docs-explain-the-tools-and-ship-no-agent-playbook.md)).
- Git versioning is optional advice, with an optional pre-commit hook snippet, in the README's
  "Version the vault with Git" section. If a note in your vault tells an agent to run `wi hook
  install`, remove that line. `wi hook` is removed
  ([0075](docs/adr/0075-git-versioning-is-advice.md)).
- On a desktop, an agent may run a `wi` command line through the plugin, with no Node:
  `obsidian vault=<name> recursive-board cmd="<wi command line>" agent=<name> model=<model>`.
  The skill and the README give the rules: a reply succeeded only when its first line is exactly
  `ok`, every call passes `vault=<name>` first, and the Obsidian installer must be 1.12.7 or later
  ([0078](docs/adr/0078-one-plugin-cli-handler.md)). The installer, the Command line interface
  setting and a running Obsidian are for agents only, so the README lists them under its agent
  part and not in the install steps.
- With no Node, an agent gets the skill from the plugin: `cmd=setup` prints the skill's text and
  the two paths where the agent saves it. `cmd=doctor` checks the vault, and `cmd=update` says
  how to update the plugin. On the plugin, the three write nothing
  ([0080](docs/adr/0080-the-plugin-serves-setup-doctor-and-update-and-writes-nothing.md)).

- A review is now a wait on a person. A card waits on a person when `depends_on` links to a note
  with `type: person`. Ask with **Waits on…** in the card menu or `wi depend <ref> --on <person>`.
  The person sends the card back by removing the wait (`--off`, or **Stop waiting on…**), and the
  card stays in doing with its holder. Moving a card to done removes its waits on people, and
  that is the approval. `wi claim` and `wi status <ref> doing` refuse a card with an open wait on
  a person, and `wi agents` does not count the holder of such a card. `wi review`, `wi approve`
  and `wi send-back` are retired: each prints the command to use and exits 0. **Send for
  review…** leaves the card menu. No command or menu item writes a `**Review:**`,
  `Approved by` or `Sent back by` note. A script that read those notes, and a dashboard that
  wrote them, must use the wait instead
  ([0082](docs/adr/0082-review-is-a-wait-on-a-person.md)).
- `wi delegate` is renamed `wi assign`, and a card can have several holders. `holder` is one name
  or a list; `wi` writes a plain value for one name, and old cards and the old `agent` key still
  read. `wi assign <ref> --to <person|agent>` adds a holder, and `--off` removes one. `wi delegate`
  is retired: it prints `wi assign` and exits 0. `wi claim` starts a card with no holder, a card
  that holds `agent`, or a card that lists the claimant; a second agent needs
  `wi assign <ref> --to agent` first, and its claim replaces `agent` with its name. `wi release`
  removes one holder: `--holder`, else `WI_AGENT` when it holds the card, else the only holder; the
  card stays where it is while another named holder remains. `wi agents` counts each agent on a
  doing card, so one card can use several places of `maxAgents`. `wi ready` treats a card with any
  holder but `agent` as taken. **Assign to…** replaces **Delegate to…** in the card menu, and
  **Unassign <name>** removes a holder. Replace `wi delegate` in your role and Dispatching notes
  ([0083](docs/adr/0083-assign-and-several-holders.md)).

### Added

- A rules version. `wi --version` prints `0.9.0 (rules 1)`, with the package version first, and
  the plugin's settings tab prints the same line. The plugin records its rules version in its
  plugin data. A write command warns when a plugin with newer rules works on the vault, and
  `wi doctor` reports a mismatch as the `rules` check
  ([0079](docs/adr/0079-the-rules-version-marker-lives-in-the-plugin-data.md)).
- The plugin registers the `recursive-board` Obsidian CLI command on the desktop app. It runs a
  whole `wi` command line from `cmd` on the vault Obsidian has open, and replies `ok` or
  `error: <reason>` on its first line. It serves every `wi` command. Its `setup`, `doctor` and
  `update` write nothing: setup prints what the plugin CLI needs and the
  skill; doctor runs the vault checks and lists the install checks it skipped; update prints the
  plugin and rules versions and where to update.
- An area's board shows the area as a self-card in its own status column, the same as its card on
  the parent board. It adds no file and no count. Drag it to another column to set the area's
  status. Open it from its preview to zoom into the same board.
- The README's "Version the vault with Git" section has a pre-commit snippet that names absolute
  paths, so a Git GUI client can run it, with the steps to set it up.

### Changed

- **Breaking:** `holder` in JSON is a list. `wi show --json` and `wi ready --json` give `holder`
  as a list of names, empty for none, in place of a string or `null`. `wi claim`, `wi release` and
  `wi assign` with `--json` give `name`, the holder they added or removed, and `holder`, the list
  after the write. A script or dashboard that reads `holder` as a string must read a list
  ([0083](docs/adr/0083-assign-and-several-holders.md)).
- The card face shows the first holder's initial and `+N` for the others. Hover over it, or open
  the card menu, for every name. The card's detail strip lists every holder.
- `wi depend <ref> --on` takes a person note as well as a card. **Waits on…** lists people and
  cards. `wi show --json` lists the people a card waits on in `personDependencies`, and
  `wi children --json` lists them in `waits_on_people`. `wi validate` accepts a link to a person
  note in `depends_on`.
- `wi` parses its command line with a parser in `src/shared` that uses no Node, and prints its
  help from one command table, so the plugin can read the same command line. The behaviour and the
  help text are unchanged ([0077](docs/adr/0077-one-command-line-in-shared.md)).
- The README install prompt installs the plugin first, from **Settings → Community plugins →
  Browse**, with the GitHub release as the manual option. `wi` on npm is the option for headless
  use and scripts. The install prompt and the install steps no longer mention the plugin CLI
  needs, which are for agents only and sit under the README's agent part.
- The area bar shows on a root board only. It holds a chip for every area in options or doing
  anywhere below the root, at any depth, in tree order. A board that is not a root shows no area
  bar, because a live area is also a card in its status column. A chip's count is still the
  area's own Doing cards. An area deeper in the tree has a hover title with the board that holds
  it ([0073](docs/adr/0073-area-chips-live-on-the-root-board.md)).
- The phone shows the same strip of small chips as the desktop, in one row that scrolls sideways.
  It replaces the collapsible Areas group of full-width rows. A chip has no ⋯ button, because the
  area's own card on its parent board has one.
- On the phone, the archived button under a board counts the archived cards of the shown tab only,
  and a tab with none shows no button. Before, it counted the whole board, so the button seemed to
  do nothing on a tab that held none of them. The desktop board is unchanged.
- The list icon of a card's child count sits on the same centre line as its number.
- Every chip on a card face has the same height (17px): child count, priority, waiting, owner or
  agent initial, label and area mark. The waiting chip was 11px tall beside a 16.5px child count.
  The checklist row's status, count and waiting chips match the label and area mark beside them.
- `wi setup` no longer offers the Git validation hook, and asks no question after the vault choice.
- The `hook` check of `wi doctor` reads the pre-commit file and reports whether it runs
  validation. It is a note, never a fix, and it prints nothing to paste.
- `AGENTS.md` is a short guide for an agent that builds on Recursive Board. It says where the
  schema, `wi --json`, the plugin data, the skill and the example dashboard are, and it keeps the
  contributor rules. The release rules left the file.

### Removed

- The agent playbook is removed, with `docs/playbook.md`, and nothing recommends an agent setup
  any more. The docs explain the tools only. `wi setup` copies the skill and saves the default
  vault, and prints no recommended setup, and `wi setup --json` has no `recommendedSetup` field.
  `wi doctor` checks the install and the vault: its agent setup checks (`agents-md`,
  `dispatching-note`, `role-notes`, `person-note`, `max-agents`, `background-wait` and
  `agent-count`) are gone, and a vault with no `AGENTS.md` and no `Roles/` folder passes every
  check. The `skill` check is now part of the Install section. `cmd=setup` on the plugin prints
  no playbook summary. `wi update` suggests nothing after the changelog, and the `suggest` field
  of its `changes` step in `--json` is gone
  ([0081](docs/adr/0081-the-docs-explain-the-tools-and-ship-no-agent-playbook.md)).
- A card that is a board no longer shows a columns badge next to its child count. The Promote and
  Demote control and menu item stay.
- `wi hook` is removed, with `install`, `uninstall` and `status`. `wi hook` is now an unknown
  command. A hook that `wi hook install` wrote earlier keeps working. Delete
  `.git/hooks/pre-commit` to remove it.

## [0.9.0] - 2026-10-06

### Agent setup

- Read the agent limit with `wi agents --json`, not `wi dashboard --panel agents --json`. The
  Dispatching procedure in the playbook says so in step 3. Change step 3 in your own Dispatching
  note. `wi doctor` finds a role or procedure note that still runs `wi dashboard`, and prints the
  new step.
- To report the boards to a person, use `wi children <root> --tree`, `wi agents` and
  `wi show <ref> --json`.

### Added

- `wi agents` prints the agents that count against `maxAgents`, each with the doing cards it
  works, the count and the limit. `--json` gives `activeAgents`, `maxAgents` and `agents`.
- `wi doctor` has an `agent-count` check.

### Removed

- The plugin has no dashboard. The dashboard view, its ribbon icon, the **Open dashboard**
  command, and the settings "Your name" and "Web pages in For review" are gone. The example
  dashboard is a separate plugin: [recursive-board-dashboard](https://github.com/vic-cio/recursive-board-dashboard).
  It copies the review ticks from the plugin data on its first load.
- `wi dashboard` is retired. It exits 0, reads nothing, and names `wi agents`. Use `wi approve`
  and `wi send-back` for a verdict.

### Changed

- **Send for review…** lists the reviewers in name order, and it signs no writer, because the
  "Your name" setting is gone.

## [0.8.3] - 2026-10-04

### Agent setup

- The package ships an optional agent playbook, `docs/playbook.md`. It describes one setup that
  works: role notes, a shared Dispatching procedure, headless workers, the agent limit and the
  review loop. Recursive Board works the same without it.
- `wi setup` ends with the playbook's recommended setup, the path of the installed playbook, and
  `wi doctor`. An agent that runs setup shows that summary to the user, and says that it is
  optional. Setup copies no role note and writes no `AGENTS.md`.
- The skill tells agents to update with `wi update`, and to run `wi update --dry-run` first.

### Added

- `wi setup` prints the optional recommended agent setup after the vault choice. `--yes` prints
  it too. `wi setup --json --vault <path>` prints one object with a `recommendedSetup` field.
- `wi doctor` checks the install and the optional agent setup on request. Each check prints pass,
  note or fix, and a fix prints the text to paste from the playbook. It writes nothing, and it
  exits 1 only when the install is broken.
- `wi update` installs the newest package, then refreshes both skill copies and the default
  vault's plugin files from it. It prints the Agent setup changes since the old version.
  `--dry-run` writes nothing.
- The npm package ships the plugin build: `dist/main.js`, `dist/manifest.json` and
  `dist/styles.css`.

### Changed

- A card whose holder is the reserved value `agent` now reads **Agent**, not "Any agent".

## [0.8.2] - 2026-10-04

### Added

- The command **Open work item** opens a card by its id or title, from a picker.
- An `obsidian://recursive-board?id=<id>` link opens the card with that id.
- The ribbon menu lists **Open work item**, and each command has an icon.

### Changed

- The card header controls wrap below the path, and stay thin on the phone.

## [0.8.1] - 2026-10-04

### Agent setup

- Any worker may start workers on its own children. The skill's "Working under a dispatcher"
  section is now "Working as a worker". The worker that starts a worker records its events and
  releases its card when it stops early.
- A reviewer's agent records the verdict with `wi approve` or `wi send-back`. It runs a verdict
  command only with the verdict that the reviewer gave. An agent never gives a verdict on its
  own work.
- An agent that only waits does not count against `maxAgents`. A claim waits when all its open
  children are in doing, or when it waits for a review verdict.

### Added

- `wi approve <ref> --you <name>` notes the approval and moves the card to done, as **Approve**
  on the dashboard does.
- `wi send-back <ref> --you <name> [--comment <text>]` notes the send back and removes `owner`, as
  **Send back** on the dashboard does.
- The dashboard Agents panel marks a claim that waits on its steps with an hourglass.

### Changed

- `wi validate` does not check the old `creator` and `creator_model` fields.
- `wi validate` does not check the note that `owner` names. It warns when `owner` is a link.
- A verdict checks that the reviewer is the card's owner, and that the card has an open review
  request.

## [0.8.0] - 2026-10-03

This release changes commands and flags. Read "Removed" before you update a script.

### Agent setup

- `wi` starts no agent. Start a worker with your harness's own tools, and give it the card id.
  The worker reads its brief with `wi show <card> --json` and claims the card by its own name.
- A card's `holder` names the person or agent who does its work. `holder: agent` asks for any
  agent. An old card's `agent` field is read as its holder.
- A role is a free tag such as `role/checker`. A note that carries the same tag is the role's
  procedure, and `wi show` lists it under `procedures`. A role does not pass down to children.
- Workers set `WI_AGENT` and `WI_MODEL`. `wi note` signs each line with them, and refuses to
  write with no writer name.
- A project's `AGENTS.md` names its board. Pass that board to `wi new --parent` and to
  `wi children`.
- To send a card for review, run `wi review` or use **Send for review…** in the card menu.
- To report the boards to a person, run `wi dashboard --you <name> --json`.

### Added

- `wi delegate <ref> --to <person|agent> [--role <name>]` sets the holder and nothing else.
- `wi review <ref> --to <name>` sends a card for review, with files and a note on what to check.
- `wi dashboard` prints the same panels as the plugin dashboard.
- `wi tag <ref> <tag> [--off]` adds or removes a free tag. The card menu has a **Tags…** item.
- `wi new --tag` and `wi new --holder`, and `wi claim --holder`.
- The dashboard has a People panel and an **Open board** button.
- **Send for review…** attaches files and adds web links. The card menu has a delegate picker.

### Changed

- `wi` finds the vault from `--vault`, `WI_VAULT`, the vault around the working folder, then
  `defaultVault`.
- `wi` and the plugin read the board settings only from the plugin data file.
- A new card does not inherit its parent's owner.
- The plugin promotes a parent to a board at its first child, as `wi new` does.
- `wi claim` takes `--holder`, or else `WI_AGENT`.

### Removed

- `wi here` is retired. It exits 0 and tells you to name the board in the project's `AGENTS.md`.
- `wi objective` is retired. Use `wi show <ref> --json`.
- `wi agents` is retired. Use `wi dashboard --panel agents`.
- `wi template` is retired. Use `wi new --template`.
- `wi trace`, `wi retag` and `wi graph` are removed. Each prints the new way and exits 0.
- The `blocked` card state is removed. Use `wi depend` to make a card wait on another card.
- `wi new` and `wi set` drop `--creator` and `--model`. `wi set --role` only removes an old
  `role` field.
- `wi` and the plugin no longer read `.wi.json` or `Recursive Board config.md`.

[Unreleased]: https://github.com/vic-cio/recursive-board/compare/0.9.0...HEAD
[0.9.0]: https://github.com/vic-cio/recursive-board/compare/0.8.3...0.9.0
[0.8.3]: https://github.com/vic-cio/recursive-board/compare/0.8.2...0.8.3
[0.8.2]: https://github.com/vic-cio/recursive-board/compare/0.8.1...0.8.2
[0.8.1]: https://github.com/vic-cio/recursive-board/compare/0.8.0...0.8.1
[0.8.0]: https://github.com/vic-cio/recursive-board/compare/0.7.1...0.8.0
