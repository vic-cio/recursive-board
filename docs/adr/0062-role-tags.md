---
status: accepted
supersedes: docs/adr/0056-inherit-role-from-the-nearest-ancestor.md
amends: docs/adr/0042-creator-and-role.md (the role field goes), docs/adr/0058-delegate-a-card.md (what the prompt names)
---
# A role is a free tag, and the note that carries it is the procedure

A role is a free tag (0057) under `role/`, such as `role/checker`. A note that is not a work item
and carries the same tag is that role's procedure note. Its body is the procedure. A card that
carries the tag uses that procedure. The tag is the whole contract: no field, no `type: role`, and
no folder.

## The decision

- Cards carry role tags in `tags`, like any free tag. `wi tag`, the Tags… picker and
  `wi new --tag` add them. Tags match without case and without a leading `#`, as in Obsidian.
- A role tag does not reach the cards below it. A card has a role only when it carries the tag.
  A search for `#role/checker` finds every Checker card, and Obsidian's tag pane lists the
  procedure note beside them.
- `wi delegate --role <name>` adds `role/<name>` to the card in the same write as the holder.
  The worker's brief names each role tag on the card and every note that carries it. A card with
  no role tag gives no procedure line; the worker follows the skill, as before.
- A card may carry several role tags. The brief lists them all, and the procedures say how they
  combine.
- `wi validate` warns only when two or more notes that are not work items carry one role tag
  (`role-procedure-duplicate`), because the brief then names several procedures. A role tag that no
  note carries is fine: a vault may use `role/` as a plain label.
- The `role` field leaves the schema. `wi validate` warns on an old `role:` line (`role-field`) and
  names the two commands that move it: `wi tag <ref> role/<name>`, then `wi set <ref> --role ""`.
  `wi new --role` and a named `wi set --role` refuse and name the tag to use.
- The plugin shows a role tag as an ordinary tag chip. The strip has no role pill.

Nothing about roles is required. A vault that never uses them sees no warning (AGENTS.md, "No
forced workflow").

## Rejected

- **Keep the `role` field with read-time inheritance (0056).** Inheritance hides state: a card's
  role is invisible on the card, and a tag search misses the cards that inherit it.
- **Find the procedure by the note's name (`role/takeoff-agent` → "Takeoff agent").** A rename or
  an accent breaks every tag silently, and the tag pane never shows the note.
- **Name the procedure file after the tag.** It forces hyphenated titles and still breaks on a rename.
- **A procedure-folder setting.** `wi validate` reads every note's frontmatter, so it finds
  duplicates without one, and a folder rule is a second convention for the same link.
- **Warn on a card role tag that no note carries.** It would warn a vault for a choice.
- **A shipped `wi migrate roles`.** One user has role fields; a one-off script with a dry run does it.

Decided in a grill on 2026-10-02. The vault's design note is "Roles in Recursive Board design".
