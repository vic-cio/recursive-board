# Recursive Board

An Obsidian plugin that renders work items as boards and checklists, and `wi`, the CLI that
writes them. Every work item is one Markdown file.

**Markdown is canonical. The plugin is a view, never the database.**

Every feature is optional. Roles, reviews and delegation are tools, not steps. The plugin stays
small: an extra feature goes to a companion plugin or stays a `wi` command.

## Use it from your own agent or dashboard

Read [`README.md`](README.md) first. It says what each part does.

- **Cards.** A card is a Markdown file with frontmatter. The README section "Work items" lists the
  fields, and `src/shared/schema.ts` is the code that checks them.
- **Read.** Run `wi show <ref> --json`, `wi children <ref> --tree --json`, `wi ready --json` and
  `wi agents --json`. The README section "Commands" lists every command.
- **Write.** Change frontmatter with `wi`, never by hand. Edit the card body directly.
- **Settings.** The plugin keeps the board settings under the `board` key of
  `.obsidian/plugins/recursive-board/data.json`. `wi` reads that file and never writes it. The
  README section "Vault configuration" shows the keys.
- **Skill.** `skills/recursive-board/SKILL.md` teaches an agent to work a vault through `wi`.
- **No Node.** On a desktop, run a `wi` command line through the plugin. The README section
  "Run commands through the Obsidian CLI" shows how.
- **Dashboard.** The core ships none. Build yours from the card files or from `wi --json`. The
  README section "Dashboard" links an example plugin to copy.

If the vault root has an `AGENTS.md`, read it. The vault owner's rules come first.

## Contribute

[`docs/adr/`](docs/adr/) records every decision the product rests on. Read the ADRs that cover your
change. If your change contradicts one, amend it or add an ADR that supersedes it.

Run `npm test` to typecheck and run every test. Run `npm run build` to build the plugin. Write
tests first for anything in `src/cli/` or `src/shared/`: a bug there corrupts canonical data
silently. Verify a plugin change by reloading Obsidian on a test vault.

Record each change in `CHANGELOG.md` under "Unreleased". Put a change to what agents are told to
do under "Agent setup", the first section.

A person never types a `wi` command, so each new command needs a plugin feature that calls the
same `src/shared/` step. `test/AGENTS.md` is the rulebook for an agent working inside a vault, not
on this code.

## Traps

- **`test/` is a deliberately invalid vault.** It carries a parent that does not resolve, a
  duplicate title and an unknown key. `wi validate --vault test` reports one error and one warning.
  `npm run fixture` generates `test/Boards/` from `scripts/fixture.ts`. Change the fixture there.
- **`src/shared/` and `src/plugin/` import nothing from Node.** One `node:` import makes the plugin
  fail to load on iOS, silently. The build and `src/plugin/ios-safety.test.ts` check this. Put
  filesystem work in `src/cli/`.
- **`src/shared/` holds every rule both writers apply.** A card ticked in Obsidian and
  `wi status <id> done` must do the same thing.
- **Edit frontmatter line-wise, never reserialise it.** `src/shared/frontmatter.ts` rewrites one
  line and copies every other byte. That keeps unknown keys and one-line diffs.
- **One file per operation.** A card's status and parent live in the child. Never write to a
  parent to record a change to a child. The one exception is
  [0035](docs/adr/0035-promote-a-parent-on-its-first-child.md).
