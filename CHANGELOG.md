# Changelog

This file lists the changes in each release of the Recursive Board plugin and `wi`. It follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the versions follow
[Semantic Versioning](https://semver.org/).

A release that changes what agents are told to do has an "Agent setup" section first. That
section covers the skill, roles, delegation and the review loop. Read it before you update
the agent notes in your vault.

## [Unreleased]

### Added

- An area's board shows the area as a quiet self-card in its own status column. It is render
  only: nothing is written, and no count changes. Open it from its preview to zoom into the same
  board.

### Changed

- The area bar shows on a root board only. It holds a chip for every area in options or doing
  anywhere below the root, at any depth, in tree order. A board that is not a root shows no area
  bar, because a live area is also a card in its status column. A chip's count is still the
  area's own Doing cards. An area deeper in the tree has a hover title with the board that holds
  it ([0073](docs/adr/0073-area-chips-live-on-the-root-board.md)).
- The phone shows the same strip of small chips as the desktop, in one row that scrolls sideways.
  It replaces the collapsible Areas group of full-width rows. A chip has no ⋯ button, because the
  area's own card on its parent board has one.

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
