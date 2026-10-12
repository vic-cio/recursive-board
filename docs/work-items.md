# Work items

Each work item is a Markdown file in the configured work-item folder. The default folder is `Boards/`. Frontmatter contains these core fields:

| Field | Purpose |
| --- | --- |
| `type` | Identifies the file as a `work-item`. |
| `id` | Stable, unique work-item identifier. |
| `title` | Work-item title. |
| `status` | One of `backlog`, `options`, `doing`, or `done`. Child items have a status; root items do not. |
| `parent` | Obsidian wikilink to the parent item. Root items omit this field. |
| `created` | Creation date in `YYYY-MM-DD` form. |
| `updated` | Last-updated date in `YYYY-MM-DD` form. |
| `board` | Set to `true` to render this item's children as a board. Otherwise omit it. |
| `prev_status` | Previous status recorded when an item moves to `done`; cleared when it leaves `done`. |
| `area` | Set to `true` for an ongoing area. Areas keep a status and have no `prev_status`. |

Optional fields include `assignee`, `priority`, `due`, `depends_on`, `tags`, and `archived`. `assignee` names the people and agents who do the card's work: one name, or a list such as `assignee: [Ana, codex-1]`. `wi` writes a plain value for one name. A reader takes `assignee`, else an old card's `holder`, else the old `agent`, and a card with more than one of these keys uses the first in that order. The assignee `agent` asks for any agent. `depends_on` lists what the card waits on: a card as a wikilink, such as `"[[Write the spec]]"`, and a person as a plain name, such as `Ana`. A person is a name in the plugin's [People](configuration.md#people) setting or a note with `type: person`, and an older `[[Ana]]` link to a person note still counts. `wi` does not rewrite an old card to migrate it. Unknown frontmatter keys are preserved. `wi validate` reports them as warnings.

## Boards and checklists

An item with `board: true` renders its children in status columns. Any other item renders its children as a checklist. The plugin reads the item's frontmatter and generates the view; the Markdown files remain the source of truth.

Every child card has a **Promote** control at the top, even before it has children. Promote it to give its own children a board. A one-line child count at the top jumps to the checklist below the note.

## Find and open a card

The command **Open work item…** finds a card by part of its id or its title, and opens it. Type a full id (`wi-k7m3`), the part after `wi-` (`k7m3`), the start of an id, or words from the title. An id match comes before a title match, and open cards come before done and archived cards. Each row shows the title, the id, and the parent path. On a phone it is in the ribbon menu. You can also add it to the toolbar.

A link of the form `obsidian://recursive-board?vault=<vault>&id=<id>` opens the card with that id, on desktop and mobile. Scripts and agents can print it. The id works with or without `wi-`. An unknown id shows a notice. When two cards share the id, the link opens the first and the notice names both.

## Areas

`wi new --template area` creates an area in `backlog` by default. Pass `--status` to choose its starting status. Areas appear in their status column. A root board also shows a chip for every area in options or doing anywhere below it, in one row above its columns. The phone shows the same row of small chips. A backlog or done area stays in its column only, and a board that is not a root shows no area bar.

An area's own board also shows the area as a self-card in its status column, the same as the area's card on its parent board. The plugin only draws it: it adds no file and no count, and `wi` never sees it. A drag to another column sets the area's status. Its preview opens the same board with a short zoom.

## Start a board by hand

1. Create the file `Boards/Project.md` with this content. A root item has no `parent` and no `status`:
   ```markdown
   ---
   type: work-item
   id: wi-0001
   title: Project
   created: 2026-01-01
   updated: 2026-01-01
   board: true
   ---
   ```
2. Open the vault in Obsidian with the plugin on. In **Settings → Recursive Board → Board**, set **Default parent** to `Project`.
3. Add a card with `wi new "Write the first card"`.
4. Open `Project` in Obsidian. The plugin shows its children as a board.
