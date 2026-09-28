---
status: accepted
---
# A dashboard view over every board

The plugin registers one view of its own, the dashboard. A ribbon icon and the command "Open
dashboard" open it in a tab, and a second call reuses that tab, like the graph view. It reads the
index and card text. It writes no work item.

It has three panels:

- **For review.** A card waits for your review when it is in doing, its `owner` equals the name
  in the setting "Your name", and it has no open child. The card's newest `**Review:**` line says
  what to check and lists each file to open as a vault-relative path in backticks. A `wi note`
  prefix before it is fine. With no such line, the row opens the card. Markdown opens in Obsidian.
  Another file opens in its own app on a desktop, and in Obsidian on a phone.
- **Progress.** Leaf cards per project, done out of total. A board is a container, so it does not
  count.
- **Agents.** Cards with an `agent`, per project: working, idle, and recently finished. A claim is
  idle when neither the card nor a child changed for an hour: its session most likely ended
  without `wi release`. A card handed to you, or with every child done, counts as finished.

A project is the nearest area above a card (0028). Cards in no area group under "No area", last.
Clicking a project focuses the review table and the agents on it.

The dashboard covers every root, or one root that a picker chooses. The name, the root, the focus
and the ticks in the review table are the plugin's own data, not the vault's. A tick records that
you looked at a file. It does not change the card.

## Why

This replaces a vault-specific dashboard plugin. Its rules were a project folder
(`Attachments/<title>`), a fixed owner name, and approval files. Areas already name the ongoing
spaces, so they replace the folder rule. The owner name becomes a setting. Approval files are
dropped: a review card lists the file to approve instead, so a card stays the one record.

A `review` field would make the review state explicit, but it would add a schema field for what
`owner` and a Notes line already say.
