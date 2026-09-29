---
status: accepted
---
# Personal dashboard state

The dashboard has choices that belong to one device and ticks that follow a person.

- Store the selected name, root, focus, web row setting, finished fold state, and folded For review
  groups with Obsidian's per-device local storage. The dashboard redraws on each vault change, so a
  fold kept only in the drawn page opens again.
- Offer notes with `type: person` as names: a button for each in the For review picker, and
  suggestions in the settings field. Keep the name open to free text.
- Store each person's review ticks in the plugin data, under `people.<name>.ticks`.
- Read the plugin data from disk whenever the dashboard renders, and when Obsidian reports that
  it changed outside the app (`onExternalSettingsChange`). On a tick, read it again, apply only the
  ticks this device changed, and write it back, so a tick made on another device survives.
- Do not add a setting that disables the dashboard.

On the first load after this change, split the old `dashboard` key in plugin data. Copy its name,
root, focus, and web row setting to local storage only when that device has no valid value already.
Merge its ticks into the selected person's entry. Then remove the old key and save plugin data.
A later device with no local name asks for one in For review.

This keeps one reviewer's settings away from teammates who share the vault. The plugin data is the
one file in the plugin folder that Obsidian Sync carries, so a reviewer's ticks follow them to
another device. Each person has their own entry, and a write changes only that entry.

## Why not a file per person

The first build stored ticks in `<plugin folder>/people/<name>.json`. Obsidian Sync carries a
plugin's standard files (`main.js`, `manifest.json`, `styles.css`, `data.json`) and not other
files in its folder, so a tick on a desktop never reached the phone. On load, the plugin moves
such a file's ticks into the plugin data and deletes the file.

The cost of one shared file: two people who tick within one sync window both write the whole
file, and Sync keeps the newer copy, so one of those ticks can be lost. A tick is cheap to redo.
The JSON is derived dashboard state; Markdown work items remain canonical.
