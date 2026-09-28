---
status: accepted
---
# A dashboard view over every board

The plugin registers one view of its own, the dashboard. A ribbon icon and the command "Open
dashboard" open it in a tab, and a second call reuses that tab, like the graph view. It reads the
index and card text. Its one write is a review verdict ([0043](0043-review-verdicts.md)).

It has three panels:

- **For review.** A card waits for your review when it is in doing, its `owner` equals the name
  in the setting "Your name", and it has no open child. The card's newest `**Review:**` line says
  what to check and lists each file to open as a vault-relative path in backticks. A `wi note`
  prefix before it is fine. With no such line, the row opens the card. Markdown opens in Obsidian.
  Another file opens in its own app on a desktop, and in Obsidian on a phone.
  The line may also list a web address (`http://` or `https://`). The setting "Web pages in For
  review" controls whether those rows appear and where they open. A web row has no tick and no
  Changed date. On a phone, a loopback address stays visible without a link because it only works
  on the computer that runs the service. See [Web rows in For review](0044-web-review-rows.md).
- **Progress.** Leaf cards per project, done out of total. A board is a container, so it does not
  count.
- **Agents.** Cards with an `agent`, per project: working, idle, and recently finished. A claim is
  idle when neither the card nor a child changed for an hour: its session most likely ended
  without `wi release`. A card handed to you, or with every child done, counts as finished.

Areas (0028) nest, so the dashboard shows one level of them at a time. With no focus, each card
groups under its top area, and cards in no area group under "No area", last. Clicking an area
focuses it: every panel shows only the cards inside it, grouped under the next area down, and the
cards directly in it group under "Directly in <area>". A trail of crumbs goes back up. A flat list
of every area would grow unreadable as boards are added.

A link on the dashboard opens in a new tab, so the dashboard stays open. Its icon is `gauge`,
because Obsidian's new-canvas button already uses `layout-dashboard`.

The dashboard covers every root, or one root that a picker chooses. The name, the root, and the
focus are device settings. Review ticks follow the person named in the setting. See
[Personal dashboard state](0045-personal-dashboard-state.md). A tick records that you looked at a
file. It does not change the card. Web rows have no tick.

## Why

This replaces a vault-specific dashboard plugin. Its rules were a project folder
(`Attachments/<title>`), a fixed owner name, and approval files. Areas already name the ongoing
spaces, so they replace the folder rule. The owner name becomes a setting. Approval files are
dropped: a review card lists the file to approve instead, so a card stays the one record.

A `review` field would make the review state explicit, but it would add a schema field for what
`owner` and a Notes line already say.
