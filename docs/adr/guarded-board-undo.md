---
status: accepted
---

# Undo restores a board write only when its file is unchanged

The plugin keeps board writes in a session undo stack. Undo restores the exact prior file text only when the file still matches the text written by that action. If another change has touched the file, undo refuses to overwrite it. Removing an item uses Obsidian's deletion flow and is not part of this undo stack.

Exact text restoration avoids maintaining a second set of inverse rules for each edit. The equality check protects later edits, including changes made by another device or tool. Undo state ends with the plugin session.

## Considered options

Undoing inverse field edits would duplicate the rules for forward changes and could miss related fields. Binding the editor's Cmd+Z would mix board actions with text editing.
