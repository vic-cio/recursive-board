---
status: accepted
---
# The rules version marker lives in the plugin data

A plugin on the Mac and an older `wi` on a server can write the same vault, and then they write
by different rules. Each writer carries a rules version, and the vault needs a marker of the
newest rules that work on it, so that an older writer can warn.

## The decision

- **The rules version is `RULES_VERSION` in `src/shared/rules-version.ts`.** It is a whole number.
  Raise it when a shared rule changes what a command writes. `wi --version` prints
  `<package version> (rules <n>)`, so its first word stays the package version. The plugin's
  settings tab prints the same line.
- **The marker is the top-level key `rulesVersion` in `.obsidian/plugins/recursive-board/data.json`.**
  The plugin raises it to its own rules version when it loads, at one call site in
  `src/plugin/main.ts`. It never lowers it. It raises it only when the plugin data file already
  exists, so a plugin that has saved nothing creates no file. `wi` reads the marker and never
  writes it ([0060](0060-read-the-board-settings-from-the-plugin-data-alone.md)).
- **A write command warns and does not refuse.** `runCommand` reads the marker through the port
  before it runs a command whose entry in the command table says it writes. When the marker is
  newer than the command's rules, it prints `wi: warning: ...` on standard error, and the command
  runs. A read command reads no marker.
- **`doctor` reports a mismatch.** `rulesCheck` in `src/shared/doctor.ts` is pure. A newer marker
  says to update `wi`, an older one says to update the plugin, and a missing marker is a note.
  `wi doctor` shows it as the `rules` check. The plugin's doctor can show the same check.

## Why the plugin data

- **It is where `wi` already reads.** No new file goes into the vault, so the user sees nothing new.
- **It travels at least as far as any other place.** Git and Syncthing carry it like any file.
  Obsidian Sync carries it when the user syncs installed community plugins. A hidden file at the
  vault root never travels by Obsidian Sync.
- **It keeps one file per operation.** The plugin raises the marker in its own file, apart from
  every card write. A marker on a card or a root board would add a second file to a write.
- **It is not in the work-item folder.** A hidden file that is not Markdown there is unaccounted
  ([0008](0008-unaccounted-file-guard.md)), and would stop `wi rm` and `wi move`.

## What it does not cover

- **A newer `wi` cannot raise the marker.** The plugin keeps its data in memory and writes the
  whole file, so a write from `wi` would be lost at the next plugin save, and 0060 forbids it. An
  older plugin therefore writes after a newer `wi` with no warning. `wi doctor` reports that case
  as an older plugin.
- **Without plugin sync, the marker stays on its device.** A server that gets no plugin data sees
  no marker, and its `wi` does not warn. `wi doctor` reports the missing marker as a note.
- **A command that has not moved into the runner yet does not warn.** It warns once its card
  registers it in `RUNNERS`.

## Rejected

- **A hidden file at the vault root, such as `.recursive-board-rules`.** Both writers could raise
  it, but Obsidian Sync does not carry hidden files, so the Mac and the server would never see
  each other's marker.
- **A visible note, such as `Recursive Board rules.md`.** It travels everywhere, but it puts a file
  that only the tools read into every user's vault.
- **A key on each card, or on the root board.** A key on each card changes every write. A key on
  the root board adds a second file to a write, and a vault can have more than one root.
- **Refuse to write when the marker is newer.** A capture on a phone or a server must keep
  working while the other writer updates.
