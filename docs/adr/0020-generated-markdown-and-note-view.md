---
status: accepted
---
# Render child checklists with generated Markdown inside the note view

The plugin composes checklist Markdown in memory and passes it to Obsidian's renderer. It intercepts task checkbox clicks and applies the shared status rule, because the rendered Markdown has no source file. Boards keep custom card elements. Checklists sit below the note body; a promoted board overlays the note pane while leaving the editor mounted behind it.

This keeps query syntax and duplicated child state out of canonical notes, while rendered rows inherit Obsidian's typography, task controls, and internal links. The plugin depends on internal Obsidian view classes to place regions and overlays, so layout changes may require maintenance after Obsidian updates.

## Considered options

Writing child lists into parent notes duplicates status and makes a move write more than one file. A registered view type would avoid internal DOM dependencies, but adds separate navigation and editing behavior. Neither is used today.
