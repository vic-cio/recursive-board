---
status: accepted
amends: 0082-review-is-a-wait-on-a-person.md (a wait on a person is a plain name), 0083-assign-and-several-holders.md (a person is in the people list or a person note)
---
# People live in the plugin data

Victor decided on 2026-10-12, for release 1.1.0, that people live in the plugin data, not in notes
of type `person`. A per-device "Your name" gives the plugin an identity, and review (a wait on a
person) and assign use it.

## The decision

- **The people list.** The `board` key of `.obsidian/plugins/recursive-board/data.json` holds
  `people`, an array of names. The plugin edits it in **Settings → Recursive Board → People**: add a
  name, or remove one. A name is one line, has no `[`, `]` or `|`, and is not `agent`. Names are
  unique, compared without case. `wi` reads the list and never writes it, as for every board
  setting ([0050](0050-board-settings-in-plugin-data.md)). An invalid list is an error, never an
  empty list. A repeat is dropped, and the first spelling stays.
- **Person notes still count.** A note with `type: person` in any folder is a person too, and no
  person needs one. The plugin creates no person note. When a name is in the list and is a note
  name, the list's spelling wins.
- **A wait on a person is a plain name in `depends_on`.** For example:
  `depends_on: ["[[Write the launch post]]", Ana]`. A wikilink is still a card link. An older
  `[[Ana]]` still counts as a wait on Ana when it resolves to a person note, or when it resolves
  to nothing and Ana is in the list. `wi depend --off`, **Stop waiting on…** and a move to done
  remove either form.
- **A plain name always counts as a wait.** It counts whether or not the vault knows the person.
  `wi validate` gives the warning `depends-unknown-person` for a name that is in neither the list
  nor a person note. An entry that is neither a wikilink nor a name stays `depends-malformed`.
- **`wi assign` and `wi depend` resolve a name.** They look in the list and the person notes,
  ignoring case, and store the vault's spelling. An unknown name is refused with one sentence that
  says to add the person in the plugin settings under People. `--to agent` and agent names do not
  change: an agent claims a card by any name.
- **The JSON stays.** `wi show --json` keeps `personDependencies`, and `wi children --json` keeps
  `waits_on_people`, with the same meaning: the names of the people the card waits on.
- **Your name is per device.** The People section has a **Your name** dropdown. Its choices come
  from the people list. The plugin keeps the choice with `app.saveLocalStorage` under the key
  `recursive-board:your-name`, so it does not sync. With no stored choice, the default is the list
  entry that equals the Obsidian account name on the device, if there is one. Obsidian has no
  public API for the account name. The plugin reads `app.account.name`, which builds before 1.6
  had, only when it is a string. On a build without it, the default is empty. **None** stores an
  empty name, which means "no one" and stops the default.
- **Where the identity shows.** **Assign to…** lists **Assign to me** first. **Waits on…** lists
  you first. The wait badge and the card's meta strip read "Waits on you" when the card waits on
  Your name, else "Waits on `<name>`". The core plugin adds no cross-board review list: views over
  many cards belong to companion plugins.
- **No migration step.** Nothing rewrites a card. Old `[[Person]]` waits and person notes keep
  working. The People setting offers the name of each person note that the list lacks as a
  one-click button.

## Why

A person note is a file that someone must make, in a folder, for each person, before the first
review. A list in the settings is one click, and it syncs with the other board settings.

A plain name is not a link. A link to a name with no note is a broken link in Obsidian's graph.
Names are already plain text in `assignee` and in signatures
([0042](0042-creator-and-role.md)).

A plain name blocks even when the vault does not know it. A device whose plugin data has not synced
yet, or a headless `wi` with no plugin data, must not let an agent start a card that waits for a
review.

Your name is per device, because two people who share a vault through sync are two identities. A
synced name would make every device the same person.

## Consequences

- A hand-written plain entry in `depends_on` was a `depends-malformed` error. Now it is a wait on
  a person. `wi validate` warns when the name is unknown, so a typo shows.
- `wi depend --on <name>` and `wi assign --to <name>` scan the vault for person notes, as before.
  A vault load scans only when a card names a link that is no work item and no listed person, or a
  name the list lacks.
- `wi agents` reads a name in the list as a person, so the list's people add no agent.
- The account-name default works only on Obsidian builds that expose `app.account`. On other
  builds, each person picks Your name once on each device.

## Rejected

- **Write `[[Name]]` for a person in the list.** It is a link to a note that does not exist.
- **Count a plain name only when the list holds it.** An unsynced list would let a card start.
- **Keep Your name in `data.json`.** It syncs, so every device would be the same person.
- **Make person notes from the list.** The plugin would write notes the user did not ask for.
