---
status: accepted
amends: docs/adr/0043-review-verdicts.md (the shared verdict checks the reviewer and the request)
---
# Give a review verdict with wi

`wi approve <ref> --you <name>` and `wi send-back <ref> --you <name> [--comment <text>]` record a
review verdict. They call `applyVerdict` in `src/shared/review.ts`, as **Approve** and **Send back**
on the dashboard do. Each verdict is one write to the card's own file. The handoff already had
both writers: `wi review` and **Send for review…** call `applyReviewRequest`.

## Who may give a verdict

The reviewer is the person that the card's `owner` names. `wi review` sets `owner` to a person note,
so a reviewer is always a person. `--you` names the reviewer, and it must match `owner`. The match
ignores case and outer spaces, and reads a link to the person note, as For review does. `--you` is
required: no default fills it in, so a verdict always names its reviewer.

`wi` cannot know who types a command. A person in a terminal and an agent that relays a person's
verdict both pass `--you`. When `WI_AGENT` is set, `wi` signs the note line with it, as `wi note`
does. The card then shows that an agent wrote the verdict, and which one. The dashboard signs no
verdict note, because the reviewer writes it there. The skill tells an agent to run a verdict
command only with the verdict a reviewer gave it, and never on its own work.

## What a verdict needs

A verdict answers a review request. The shared function refuses a card:

- that is not in doing (0043);
- whose `owner` is empty or names another person;
- with no `**Review:**` note after its last `Approved by` or `Sent back by` note.

`wi` also refuses a card with an open child that is not archived, because For review leaves such
a card out. That check reads other files, so it is in `src/cli/commands/review.ts`, not in the
shared function. The plugin does not need it: it shows the buttons only on rows that For review
lists.

The checks moved into the shared function, so the plugin applies them too. The dashboard showed
its buttons only for cards that passed them. A card that changed after the dashboard drew it is
now refused, not written.

`wi` does not read the review ticks. A tick is personal display state in the plugin data (0045),
and `wi` never writes the plugin data. A tick records only that a person looked at a file row
(0043), so it is no evidence that `wi` can check. After a verdict from `wi`, the reviewer's old
ticks stay in the plugin data. They do not count toward the next request, because a tick counts
only when it is newer than the request (`tickCounts`).

`wi approve` reports what `wi status <ref> done` reports: each card that can start now, and the
parent when this was its last open child.

## Rejected

- **A `review` flag on `wi review`**, such as `--approve`. One command would send and judge, with
  flags that mean nothing together. Two commands name the dashboard's two buttons.
- **`--you` from `WI_AGENT`.** An agent is not a reviewer, and the verdict would name the agent.
- **No owner check in the CLI.** Any name would close any card that waits for review. That
  bypasses the request, which is the evidence that a person was asked.
- **Requiring ticks in the CLI.** An agent or a terminal user has no ticks, so the CLI verdict
  would depend on a plugin view. People and agents get the same powers.
