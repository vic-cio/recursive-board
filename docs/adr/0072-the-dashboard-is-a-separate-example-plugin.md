---
status: accepted
supersedes: docs/adr/0040-dashboard-view.md, docs/adr/0044-web-review-rows.md, docs/adr/0045-personal-dashboard-state.md, docs/adr/0055-dashboard-summary-in-the-cli.md
amends: docs/adr/0041-card-dependencies.md (where the dashboard lives), docs/adr/0058-delegate-a-card.md (where the dashboard lives), docs/adr/0034-agent-limit.md (where the count shows), docs/adr/0043-review-verdicts.md (where the buttons live), docs/adr/0061-holder-names-who-does-the-work.md (wi agents), docs/adr/0066-count-only-working-agents.md (where the rule lives)
---
# The dashboard is a separate example plugin

Recursive Board ships no dashboard. The core plugin renders boards and checklists, and `wi` gives
general tools. A dashboard is a separate Obsidian plugin that each vault builds for itself. The
example is [recursive-board-dashboard](https://github.com/vic-cio/recursive-board-dashboard). It
has no releases and no community listing. People copy it and change it.

## What left Recursive Board

- The plugin's dashboard view, its ribbon icon and its **Open dashboard** command.
- The settings "Your name" and "Web pages in For review", and the personal dashboard state.
- The **Approve** and **Send back** buttons. `wi approve` and `wi send-back` stay.
- `wi dashboard` and `src/shared/dashboard.ts`. `wi dashboard` stays as a retired command: it
  exits 0, reads no vault, and names `wi agents` and the example.

The plugin keeps every key in its data file that it does not know. The review ticks under
`people.<name>.ticks` stay on disk, and the example dashboard copies them on its first load.

## What stays

- **Send for review…** in the card menu. It is a card action, and it is the plugin feature for
  `wi review`. With no "Your name" setting, it lists the reviewers in name order and signs no
  writer.
- `wi review`, `wi approve`, `wi send-back`, `wi children`, `wi show --json` and `wi ready`. A
  custom dashboard, or an agent that reports to a person, composes its view from these.

## `wi agents`

`wi agents` prints the agents that count against `maxAgents`, each with the doing cards it works,
the count and the limit. `--json` gives `activeAgents`, `maxAgents` (`null` for no limit) and
`agents`. It replaces `wi dashboard --panel agents`, which the Dispatching procedure read before
each start. The count is the rule of [0066](0066-count-only-working-agents.md), now in
`src/shared/agents.ts`. `wi claim` warns from the same rule. `wi doctor` has an `agent-count`
check: a role or procedure note that still runs `wi dashboard` gets a fix with the new step.

## The example reads files, not `wi`

An Obsidian plugin on iOS cannot run a CLI. So the example reads the card files through
Obsidian's metadata cache, and reads the board settings from Recursive Board's plugin data without
writing them. It holds a copy of the shared rules it needs, so a verdict there makes the same edit
as `wi approve`. A copy can drift from Recursive Board. That is the cost of a dashboard that each
vault owns.

## Why

The core plugin is the stable centre of each vault's own system. It must stay small, so that once
it is complete it changes only when the tools around it change. A bundled dashboard was never part
of the plan, and every vault wants different panels. Victor decided this on 2026-10-05.

This narrows the rule in `AGENTS.md` that each `wi` command has a plugin feature: `wi approve` and
`wi send-back` have theirs in the example dashboard, not in the core plugin.

## Rejected

- **A second package in this repo.** It would ship and version with the core, which is what the
  split removes.
- **The example imports the rules from the `recursive-board` package.** The package is the CLI.
  Its rules would tie the example to each release, and the example could not change them.
- **The example runs `wi dashboard --json`.** It would not work on a phone.
- **Keep `wi dashboard` as public tooling.** One command that knows every panel is a dashboard
  in the CLI. General commands compose into any view.
