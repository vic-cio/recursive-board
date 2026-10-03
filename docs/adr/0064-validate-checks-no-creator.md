---
status: accepted
amends: docs/adr/0042-creator-and-role.md (what wi validate checks)
---
# wi validate checks no creator field

Cards no longer record their creator (0063). Old `creator` and `creator_model` fields stay valid
and are preserved, but nothing writes them and no command reads them for a decision. The plugin
still shows an old creator on the meta strip.

## The decision

- `wi validate` does not check `creator` or `creator_model`. The rules `creator-unknown`,
  `creator-type`, `creator-link` and `creator-model-alone` go.
- `owner` keeps its checks: `owner-link` for a value written as a link, and `owner-type` for a note
  that is not a person note. An owner with no note is still fine.

## Why

Each creator warning asked the user to make a note or rewrite a field that no command uses. The
fix it named ("Make a person or role note called session") also treated `type: role` as a kind of
note, which 0062 removed. A warning for a field that nothing reads breaks the "No forced workflow"
rule in AGENTS.md.

## Rejected

- **Keep `creator-link` only.** A link in an old field still draws a graph edge, but the warning
  said that `wi set` rewrites it, and `wi set` no longer takes `--creator` (0063).
- **A migration that removes old creator fields.** AGENTS.md keeps every key a vault has. The
  fields do no harm.

Found in a dry run on 2026-10-03 (card wi-z5du).
