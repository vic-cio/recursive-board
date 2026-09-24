---
status: accepted
---

# Checklist discovery and empty-card promotion

This decision amends [0015](0015-checklist-and-board-navigation.md).

The checklist stays below the note body. A one-line child-count summary appears near the top of
the note and jumps to the checklist, so a person can discover it without reading to the end first.
The line includes **Add** because it lands at the checklist and its add control.

Every child work item shows **Promote**, even when it has no children yet. A root has no parent to
promote it under; roots are created as boards. Existing boards can still be demoted.

Promoting writes `board: true` to that work item's frontmatter. The checklist summary only
navigates within the current view and does not change the Markdown.
