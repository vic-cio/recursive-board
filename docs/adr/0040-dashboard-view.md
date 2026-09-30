---
status: accepted
---
# A dashboard view over every board

The plugin registers one view of its own, the dashboard. A ribbon icon and the command "Open
dashboard" open it in a tab, and a second call reuses that tab, like the graph view. It reads the
index and card text. Its one write is a review verdict ([0043](0043-review-verdicts.md)).

It has four panels:

- **For review.** A card waits for your review when it is in doing, its `owner` equals the name
  in the setting "Your name", and it has no open child. The card's newest `**Review:**` line says
  what to check and lists each file to open as a vault-relative path in backticks. A `wi note`
  prefix before it is fine. With no such line, the row opens the card. Markdown opens in Obsidian.
  Another file opens in its own app on a desktop, and in Obsidian on a phone.
  The line may also list a web address (`http://` or `https://`). The setting "Web pages in For
  review" controls whether those rows appear and where they open. A web row has no tick and no
  Changed date. On a phone, a loopback address stays visible without a link because it only works
  on the computer that runs the service. See [Web rows in For review](0044-web-review-rows.md). On
  a phone, each review row stacks the target, card, check, type, changed date, and approval controls.
  Long names, instructions, and URLs wrap inside the row.
- **Progress.** Leaf cards per area row, done out of total. A board is a container, so it does not
  count. Backlog cards are not planned yet, so they stay out of the total, and the row names their
  count apart. When options run out, the bar fills, and that is the sign to bring cards out of the backlog. A click anywhere on an area row focuses that area. A board icon at the row's right end
  opens the area's board, with a tap area the full height of the row. A working badge on the row
  counts the agents that work inside it, and hides at zero.
- **Agents.** One flat feed under Progress, newest first. Each agent row shows the card, its age,
  the agent, a chip for the area one level under the focus, and the steps done. A card directly in
  the focused area has no chip. The working badge and the feed count the same claims, so they
  agree. A card handed to you, or with every child done, counts as finished. Finished claims from
  the last 24 hours, at most ten, sit behind one fold. The fold is closed by default, and its state
  is a device setting. With nothing working and nothing finished, the feed says "No agent is working."
- **Needs attention.** Dependency problems ([0041](0041-card-dependencies.md)), and idle claims as
  "Agent went quiet". A claim is idle when neither the card nor a child changed for an hour: its
  session most likely ended without `wi release`. The panel shows only when it has a row.

Each agent row and each quiet row ends with a copy icon, the same size as the board icon in Progress. A
click copies the card id, so a person can paste the card to an agent. For review shows the card id
under its title on desktop and phone layouts. Clicking the id copies it and shows a notice.
A card with no id shows no copy control; `wi validate` reports it.

Areas (0028) nest, so the dashboard shows one level of them at a time. With no focus, each card
groups under its top area, and cards in no area group under "No area", last. Clicking an area
focuses it: every panel shows only the cards inside it, grouped under the next area down, and the
cards directly in it group under "Directly in <area>". A trail of crumbs goes back up. A flat list
of every area would grow unreadable as boards are added.

A vault link on the dashboard opens in the same tab on mobile, including **Open board**.
On a desktop, it opens in a new tab, so the dashboard stays open.
Web addresses follow the configured browser or Web viewer behavior in [0044](0044-web-review-rows.md).
The dashboard icon is `gauge`, because Obsidian's new-canvas button already uses `layout-dashboard`.

The dashboard covers every root, or one root that a picker chooses. The picker shows only when
the vault has more than one root. The name, the root, the focus,
the finished fold, and the folded For review groups are device settings. Review ticks follow the person named in the setting. See
[Personal dashboard state](0045-personal-dashboard-state.md). A tick records that you looked at a
file. It does not change the card. Web rows have no tick.

## Why

This replaces a vault-specific dashboard plugin. Its rules were a project folder
(`Attachments/<title>`), a fixed owner name, and approval files. Areas already name the ongoing
spaces, so they replace the folder rule. The owner name becomes a setting. Approval files are
dropped: a review card lists the file to approve instead, so a card stays the one record.

A `review` field would make the review state explicit, but it would add a schema field for what
`owner` and a Notes line already say.
