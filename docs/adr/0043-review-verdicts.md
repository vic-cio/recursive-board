---
status: accepted
---
# Approve or send back a review from the dashboard

This amends [0040](0040-dashboard-view.md), which said the dashboard writes no work item.

A tick in the review table records only that you looked at a file row. Ticks follow the selected
person across devices. Web rows have no tick and do not count toward a verdict. When every file row of a card is ticked, the
card's row shows two buttons. A card with only web rows has no verdict buttons; its agent closes
it.

- **Approve** writes the note `Approved by <you>.` and moves the card to done.
- **Send back** offers a comment, writes the note `Sent back by <you>: <comment>`, or
  `Sent back by <you>.` when the comment is blank, and removes
  `owner`. The card stays in doing with its agent, so it leaves For review and goes back to the
  agent that did the work.

Each verdict is one write to the card's own file: the note and the frontmatter change together.
The rule lives in `src/shared/review.ts`, so a later `wi` command applies the same edits. A
verdict refuses a card that is not in doing. The comment is optional and one line, because a note is one line.
After a verdict, the dashboard removes the card's ticks from that person's entry in the plugin data, so a card
sent back starts its next review clean. The notice that confirms a verdict carries Undo, like a move.

## Why

The review table told you what to check but left the verdict to a separate session with an
agent. Approving is the common case and is one click. Sending back needs words, so it asks for
them, and the Notes line carries them to the agent that picks the card up.

Removing `owner` is enough to hand the card back: `owner` is what puts it in For review, and the
agent's `agent` field is still on the card. No new field records the verdict; the Notes line does.
