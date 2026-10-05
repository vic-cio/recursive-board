---
status: accepted
amended_by: 0065-review-verdicts-in-wi.md (wi approve and wi send-back; the shared verdict checks the reviewer and the request), 0072-the-dashboard-is-a-separate-example-plugin.md (the buttons live in the example dashboard plugin)
---
# Approve or send back a review from the dashboard

This amends [0040](0040-dashboard-view.md), which said the dashboard writes no work item.

A tick in the review table records only that you looked at a file row. Ticks follow the selected
person across devices. Web rows have no tick and do not count toward a verdict. When every file row of a card is ticked, the
card's row shows two buttons. A card whose review lists no file, or only web pages, has its own row
with a tick. That tick counts as the card's one file row.

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

A card with no file to check still needs a verdict from the dashboard. Its own row gives the
reviewer one place to record that they looked. A card enters For review only after a send-for-review
request. That one write sets `owner` and appends a `**Review:**` note. The newest request must follow
the last `Approved by` or `Sent back by` note. Send back removes `owner` and writes its verdict note.
Both edits hand the card back and close the current request.

No new field records the verdict; the Notes line does. The agent's `agent` field stays on the card.

## Amendment 2026-10-05: the buttons left the core plugin

Recursive Board ships no dashboard ([0072](0072-the-dashboard-is-a-separate-example-plugin.md)).
**Approve** and **Send back** live in the example dashboard plugin, which applies the same shared
verdict. `wi approve` and `wi send-back` ([0065](0065-review-verdicts-in-wi.md)) stay.
