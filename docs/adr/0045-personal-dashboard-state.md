---
status: accepted
---
# Personal dashboard state

The dashboard has choices that belong to one device and ticks that follow a person.

- Store the selected name, root, focus, and web row setting with Obsidian's per-device local storage.
- Offer notes with `type: person` as name suggestions. Keep the name field open to free text.
- Store each person's review ticks in `<plugin folder>/people/<name>.json`.
- Read the tick file whenever the dashboard renders. Write it when a tick changes or a verdict clears ticks.
- Encode the selected name as one safe filename segment.
- Do not add a setting that disables the dashboard.

On the first load after this change, split the old `dashboard` key in plugin data. Copy its name,
root, focus, and web row setting to local storage only when that device has no valid value already.
Merge its ticks into the selected person's tick file. Then remove the old key and save plugin data.
If the person has no name, there is no tick file to receive old ticks. A later device with no local
name asks for one in For review.

This keeps one reviewer's settings away from teammates who sync the plugin folder. The person file
syncs with the vault, so the reviewer's ticks follow them to another device. The JSON file is
derived dashboard state; Markdown work items remain canonical.
