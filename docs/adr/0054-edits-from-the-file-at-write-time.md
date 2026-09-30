---
status: accepted
---
# Compute each edit from the file at write time

An edit that depends on a current value is computed from the text that the writer is about to
rewrite. The CLI reads that text under its per-file lock (0037). The plugin reads it inside
`vault.process`. Neither writer decides from the vault it loaded or from Obsidian's metadata
cache, because both can be older than the file.

The shared `Edit` type stays as it is. The new `EditPlan` is either a list of edits or a rule
`(text) => Edit[] | null`. `editItem` and the plugin's `edit` run the rule on the current text. A
rule returns null for no change, and throws to refuse. The shared rules that read a card's text
are `cardState`, `statusEditsIn`, `untickEditsIn`, `dependencyEditIn` and `areaTagEditsIn`. Both
writers use them, so the two writers cannot drift.

A plan is smaller than an add-or-remove list edit. One mechanism covers a list (`depends_on`,
`tags`), a recorded value (`prev_status`), and a refusal (`wi claim`, `wi area`, the creator in
`wi set`). A list edit alone could not refuse a second claim.

The rules for each writer:

- `wi claim`, `wi release`, `wi status`, `wi depend`, `wi retag`, `wi set`, `wi area`,
  `wi archive`, `wi promote` and `wi move` compute their edits under the lock. Of two agents that
  claim one card at once, the second finds the first agent's name and is refused.
- The plugin's status menu, checkbox, Waits on picker, area conversion, archive, promote and
  move compute their edits inside `vault.process`. The metadata cache only decides if a click
  needs a write.
- A check that reads other cards still uses the loaded vault or the index. That includes the
  dependencies being open, a child in doing, the first child count, and a doing descendant.
  One file per operation means the writer locks only the card it writes.
- `wi new` creates the file with a hard link from a temporary file. A link never replaces a
  file, so `wi new` cannot overwrite a card made since the load. When the path holds a work
  item, `wi new` tries the id-suffixed name. When the path holds any other file, `wi new` refuses.
- The lock is a file created exclusively. It holds a token that is unique to its holder. A lock
  older than 30 seconds is stale. A process takes over a stale lock by renaming it to a unique
  name. When the renamed file is not the one it judged stale, the process links it back. A holder
  removes the lock only when it holds that holder's token. A directory lock from wi 0.7.0 still
  excludes, and a stale one is taken over the same way.
- Every `wi move` in a vault also takes one vault-wide move lock and reads each parent in the
  target's chain from disk. Two concurrent moves that make a loop cannot both pass the check.
  The lock is only for `wi` on one machine. A move in Obsidian or on a synced device does not
  take it, so across writers the loop check is best effort. A full fix needs a lock that the
  plugin and every device share, and no such lock exists.
- The plugin's dependency cycle check compares cards by path, not by object. The index makes new
  objects when it rebuilds, and a card object from before a rebuild still matches.
