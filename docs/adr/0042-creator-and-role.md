---
status: accepted
---
# A card records its creator, and a role does its work

Three optional fields say who is behind a card:

```yaml
role: Checker                   # the role that must do the work
creator: Project lead           # the person or role that made the card; set once
creator_model: gpt-6-luna       # the model, when an agent made it
```

`creator`, `role` and `owner` hold the plain name of a note. A person note has `type: person`. A
role note has `type: role`, and its body is the procedure for that role. The product requires no
folder for them: a name finds any note of that name, as a link would, so a vault with its own
people notes can use them.

The names are plain, not links. The first version wrote links, and every card and Knowledge note
then drew a graph edge to its creator: the graph became one star around each person. A person or
role note lists what it made with a Bases table instead (`creator == "Ana"`), and the strip
still opens the note. `agent` keeps its one job: the unique id of the worker
that holds the claim (0038).

A role stays the same when the model that fills it changes. That is why the model is a separate
field, and why it holds only the model id: the harness adds little once the role is known, and the
reasoning effort changes for each run.

## Who writes it

- `wi new --creator <name> --model <id> --role <name>` writes the three fields as plain names. A
  link given by habit becomes its name.
  `--creator` and `--model` fall back to `WI_CREATOR` and `WI_MODEL`, so a dispatcher sets them
  once for each worker. `wi new` warns when a card has no creator, and `--strict` refuses it, as
  with the brief (0036). Without `--role`, the card copies the role of its nearest ancestor that
  has one (0056-inherit-role-from-the-nearest-ancestor.md). The board's add row does the same.
- `wi set <ref> --owner … --role … --creator … --model …` changes an existing card, one file, one
  write. An empty `--owner` or `--role` removes it. It writes `creator` and `creator_model` only
  when the card has none, so a migration can credit old cards but nothing can rewrite who made one.
- The board's add row writes `creator` from the plugin setting "Your name".
- `wi note` names the writer as "Role (model)": `--agent` first, then `WI_CREATOR`, then the
  card's `role`, then the card's `agent`, with `WI_MODEL`.

## What wi validate checks

- A `creator` or `role` with no note of that name is a warning (`creator-unknown`, `role-unknown`).
  An `owner` with no note is fine, because a vault need not keep person notes.
- A note of the wrong `type` is a warning (`creator-type`, …): `creator` takes a person or a role,
  `owner` a person, `role` a role. Another vault may type its notes differently.
- A value written as a link is a warning (`creator-link`, …), because it draws a graph edge.
  `wi set` rewrites it as the plain name, even for a creator.
- `creator_model` without `creator` is a warning.

A missing `creator` means the card was made before authorship was recorded. It does not mean a
person made it.

## The raw Properties panel

On a work item, the plugin hides Obsidian's raw Properties panel. The meta strip takes its place,
under the note's title, and says the same facts in words. The breadcrumbs stop at the parent when
the note shows its own title. The strip acts on the facts: a role, owner or creator opens its note, "Waits on" opens each
dependency, the id copies itself, and the breadcrumbs jump to each ancestor. The strip's
Properties button shows the raw panel to edit a field. The choice lasts until another note opens.
Other notes keep Obsidian's panel.

## Rejected

- **Links.** They draw a graph edge from every note to its creator and role. The name check in
  `wi validate` stops spellings drifting apart without them.
- **A kind field (`creator_kind: agent`).** The linked note's type already says it.
- **Product-owned `People/` and `Roles/` folders.** They would impose a structure on a vault that
  already has one.
- **The harness and the effort in the record.** They belong to a run, not to the card.
