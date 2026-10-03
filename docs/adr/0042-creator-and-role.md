---
status: accepted
amended_by: docs/adr/0062-role-tags.md (the role field is gone; a role is a tag), docs/adr/0064-validate-checks-no-creator.md (wi validate checks no creator)
---
# Roles guide work, and writers sign notes by name

> **Amended by 0062.** The `role` field below is gone. A role is a free tag such as `role/checker`,
> and the note that carries the tag is the procedure. The creator and owner rules stand.
>
> **Amended by 0064.** `wi validate` no longer checks `creator` or `creator_model`.

`role` names a role note that gives the procedure for the work:

```yaml
role: Checker
```

`role` and `owner` hold the plain name of a note. A person note has `type: person`. A role note has
`type: role`, and its body is the procedure for that role. The product requires no folder for
them. A name finds any note of that name, as a link would, so a vault can use its own notes.

The names are plain, not links. `agent` keeps its one job: the unique id of the worker that holds
the claim (0038). Older cards may keep `creator` and `creator_model`. New cards do not write them.

A role stays the same when the model that fills it changes. The model belongs to a run, not a card.

## Who writes it

- `wi new --role <name>` writes an explicit role as a plain name. Without it, the card stores no
  role. Readers resolve its own role or the nearest ancestor's role (0056). The board's add row
  stores no role or creator. `--creator` and `--model` remain accepted no-ops with a stderr note.
  `--strict` checks only the brief (0036).
- `wi set <ref> --owner … --role … --creator … --model …` changes an existing card, one file, one
  write. An empty `--owner` or `--role` removes it. Creator options remain for old cards.
- `wi note` signs with `--agent` or `WI_AGENT`, and adds `WI_MODEL` when set. It refuses to write
  without a writer name. It never uses a card's role or holder as the writer.
- The plugin signs notes from a person with the name in its "Your name" setting.

## What wi validate checks

- A `creator` or `role` with no note of that name is a warning (`creator-unknown`, `role-unknown`).
  An `owner` with no note is fine, because a vault need not keep person notes.
- A note of the wrong `type` is a warning (`creator-type`, …): `creator` takes a person or a role,
  `owner` a person, and `role` a role. Another vault may type its notes differently.
- A value written as a link is a warning (`creator-link`, …), because it draws a graph edge.
  `wi set` rewrites it as a plain name, even for a creator.
- `creator_model` without `creator` is a warning. Old creator fields remain valid.
- New cards need no creator or model.

## The raw Properties panel

On a work item, the plugin hides Obsidian's raw Properties panel. The meta strip takes its place,
under the note's title, and says the same facts in words. The breadcrumbs stop at the parent when
the note shows its own title. The strip acts on the facts: a role, owner or creator opens its note,
"Waits on" opens each dependency, the id copies itself, and the breadcrumbs jump to each ancestor.
The strip's Properties button shows the raw panel to edit a field. The choice lasts until another
note opens. Other notes keep Obsidian's panel.

## Rejected

- **Links.** They draw a graph edge from every note to its creator and role. The name check in
  `wi validate` stops spellings drifting apart without them.
- **A kind field (`creator_kind: agent`).** The linked note's type already says it.
- **Product-owned `People/` and `Roles/` folders.** They would impose a structure on a vault that
  already has one.
- **The harness and the effort in the record.** They belong to a run, not to the card.
