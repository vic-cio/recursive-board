---
status: accepted
supersedes: 0048-synced-vault-config-note.md
amended_by: 0060-read-the-board-settings-from-the-plugin-data-alone.md
---
# Store the board settings in the plugin data

Store the board settings under one `board` key in the plugin data file, `.obsidian/plugins/recursive-board/data.json`. The key holds `workItemFolder`, `defaultRoot`, `extraSections`, `maxAgents` and `autoPromote`, next to `statusColors` and `people`. The settings tab edits every setting. A note in the vault root is clunky, and a user expects a plugin's settings in its settings tab.

The plugin is the one writer. It keeps the plugin data in memory and writes the whole file on `saveData`, so a second writer would lose updates. `wi` reads the file and never writes it. `wi config migrate` is removed.

`wi` reads the `board` key, or uses the defaults when there is none. An invalid key is an error; it never falls through to the defaults. `findVaultRoot` also stops at a folder that holds the plugin data file. `wi` assumes the config folder is `.obsidian`.

Amended: `wi` and the plugin no longer read `Recursive Board config.md` or `.wi.json`, and the plugin no longer migrates them. See [0060-read-the-board-settings-from-the-plugin-data-alone.md](0060-read-the-board-settings-from-the-plugin-data-alone.md).

Obsidian Sync carries the plugin data file only when **Installed community plugins** sync is on for the device. A device with no `board` key uses the defaults. When it has cards, it shows a notice once, stored per device. Saving any board setting writes the key. Keep and ignore a removed `areaTags` property in the key.

`onExternalSettingsChange` reloads the board settings, so a change synced from another device applies at once. First-board setup sets `defaultRoot` in the `board` key.

The tab edits `workItemFolder` as a text field with a folder suggester and a **Rename** button. Rename moves the folder with `fileManager.renameFile`, one step whatever the card count, then points the board at it. If the settings save fails, the plugin renames the folder back. The plugin serializes board setting writes because each save writes the whole data file. Links name files, not folders, so they survive. When a folder with the new name exists, the board reads it and moves nothing. A button, not a blur, commits the change, so a typo never renames a folder.

The tab edits `extraSections` as one chip per heading, with one field and Add, and × on each chip. A heading is added or removed, never edited, so no one has to follow a separator rule. Blanks and repeats are dropped. The description names the built-in sections the headings follow. The tab labels `defaultRoot` **Default parent**, because it names a card, not a folder.

## Rejected

- Flat keys at the top level of the plugin data: they mix board settings with device and person state.
- A separate file in the plugin folder: Sync carries only `main.js`, `manifest.json`, `styles.css` and `data.json`.
- Migration by `wi`, or by both writers: a `wi` write races the in-memory copy in Obsidian.
