---
status: accepted
---
# Free tags have one shared step and leave old area tags alone

A card's `tags` can hold old area tags and free tags. A free tag is any tag a person or an agent
chooses. A free tag is a label on the board (0018), so search and the tag pane see it with no extra
work.

Agents use `wi tag` instead of a text tool to change free tags, which 0004 requires.

## The decision

`src/shared/tags.ts` holds one step that adds or removes a free tag. `wi tag <ref> <tag> [--off]`
and the **Tags…** item in the card menu both call it, so they agree:

- A leading `#` and the case do not matter. `Design`, `design` and `#design` are one tag, as in
  Obsidian. A new tag goes at the end of the list. A remove takes out every spelling of the tag.
- The step refuses an `area/` tag, and the bare tag `area`. Existing area tags stay unchanged until
  the owner chooses a cleanup. Obsidian's `tag:#area` also matches every area tag, so a free tag
  `area` would join that family.
- The step refuses text that Obsidian does not read as one tag: a space, a character other than a
  letter, a number, `_`, `-` or `/`, or a tag of numbers only.
- The step reads the tags in the file at write time (0054). A tag that another writer added since
  the read stays.
- The step writes the list as a block list. It changes the `tags` entry and copies every other
  line (0005). With the last tag removed, the key goes.

## The menu picker

**Tags…** opens a suggest modal. It shows the card's free tags first, checked, and then every other
free tag on a work item. Choosing a checked tag removes it, and choosing another tag adds it. Typed
text that names no tag in use shows as a new tag, or as a refusal with its reason. The picker
offers tags from work items only, because the index already holds them. Obsidian has no public
API that lists every tag in the vault. Each change is one undoable board write.

## Consequences

- A tag change writes one file, the card. That keeps the "one file per operation" rule.
- `wi set` and `wi new` do not take a tag. Add a tag after the card exists.
