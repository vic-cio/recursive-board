---
status: accepted
---
# The agent playbook ships in the package, with marked blocks

`docs/playbook.md` describes one agent setup that works: a session agent, headless workers that
split their cards, role notes, a shared Dispatching procedure, the agent limit, and lessons from
runs. It is optional. The README links it as optional, and no command needs it. `wi validate` never
reports a vault that does not follow it (AGENTS.md, "No forced workflow").

## The decision

- The npm package ships the playbook: `package.json` lists `docs/playbook.md` in `files`. A new
  user sees the README only after the install, so a repo file alone does not reach them. Commands
  read the installed copy offline. `scripts/playbook.test.ts` checks that `npm pack --dry-run`
  lists it.
- The playbook names one harness where it must. The launch line uses Claude Code with
  `bypassPermissions`, says that it is one harness, and names the risk of bypass. wi still starts
  no agent (0063).
- The playbook carries no personal content: no names of people or projects, no vault paths, and
  no card ids. The test checks for card ids and paths.

## Markers

Later commands read the playbook: `wi setup` prints its summary, and `wi doctor` checks a vault
against it. Code finds each part by these markers. A change to them is a change to this ADR.

- **Marked block.** A fenced code block whose opening fence has a word `playbook=<name>` in its
  info string, for example a fence of three backticks followed by `markdown playbook=dispatching`.
  The first word stays the language, so the block renders as usual. The block ends at the first
  fence line of the same character and at least the same length. Each name appears once.
- **Block names.**
  - `summary`: plain text that `wi setup` prints, like `--help` output. Lines are at most 80
    characters.
  - `agents-and-roles`: a Markdown section for a vault `AGENTS.md`. It starts with the heading
    `## Agents and roles`.
  - `role-note`: an example role note, with frontmatter, for `Roles/Coder.md`.
  - `dispatching`: the Dispatching procedure note, with frontmatter, for `Roles/Dispatching.md`.
  - `checks`: one recommendation per line: a check id (lowercase words joined by hyphens), two or
    more spaces, and the text. `wi doctor` reports by these ids.
- **Changes.** The last section is `## Changes`. It has one `###` heading per version that changed
  the playbook, newest first. A heading is a version number, such as `0.9.0`, or `Unreleased` for
  the next release. The release step renames `Unreleased` to the version.

`scripts/playbook.test.ts` holds a reader for this grammar and checks the file against it.

## Rejected

- **Keep the playbook in the repo only.** A new user who installs with npm never sees it, and a
  command could not read it offline.
- **Copy role notes and an `AGENTS.md` into the vault with `wi setup`.** It writes a workflow into
  the user's vault. Printing text to paste leaves the choice with the user.
- **HTML comment markers around each block.** They work, but a reader then needs two kinds of
  marker. The info string is part of the fence and survives every Markdown renderer.
- **A harness-neutral launch line only.** A worked example needs one command that runs. The
  playbook gives one and says how to swap it.
