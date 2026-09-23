# Who writes `updated`

`updated` is a date in `YYYY-MM-DD` form, not a filesystem modification time. The table covers the work-item writers and the paths that carry an existing value through an operation.

| File and function | Trigger | Effect on `updated` |
| --- | --- | --- |
| `src/cli/commands/new.ts` `createItem`; `src/shared/work-item.ts` `renderWorkItem`; `src/cli/write.ts` `writeAtomic` | `wi new` | Creates a card with `created` and `updated` both set to today. It does not edit the parent. |
| `src/plugin/actions.ts` `createChild`; `src/shared/work-item.ts` `renderWorkItem` | Add row in a board or checklist | Creates a card with both dates set to today. It does not edit the parent. |
| `src/cli/commands/status.ts` `setStatus`; `src/cli/write.ts` `editItem` | `wi status` | Stamps today when status changes; same status returns without writing. |
| `src/cli/commands/move.ts` `moveItem`; `src/cli/write.ts` `editItem` | `wi move` | Stamps today when the parent changes; moving to the current parent returns without writing. |
| `src/cli/commands/archive.ts` `archiveItem`; `src/cli/write.ts` `editItem` | `wi archive` or `wi archive --undo` | Stamps today when the archive flag changes; repeated action returns without writing. |
| `src/plugin/actions.ts` `setStatus`, `setDone`, `setPromoted`, `setArchived`, `move`, `edit` | Board drag, status menu, checklist tick, promote toggle, archive menu, or Move to picker | Stamps today when the requested frontmatter edit changes the file. Action-level no-ops return early; the shared edit function also handles stale UI state. |
| `src/shared/transitions.ts` `statusEdits`, `boardEdits`, `moveEdits`; `src/shared/archive.ts` `archiveEdits`; `src/shared/edits.ts` `applyStampedEdits`, `withStamp`, `applyEdits`; `src/shared/frontmatter.ts` `setKey`, `removeKey` | Called by the CLI and plugin actions above | Builds and applies line-wise field edits. `applyStampedEdits` adds the date only after a requested edit changes the text; an explicit `updated` edit is preserved. `setKey` leaves an equal existing value and its formatting alone. |
| `src/plugin/actions.ts` `undo`; `src/plugin/undo.ts` `UndoStack.restore` | Undo last board action | Restores the prior file bytes, including the prior `updated` date, if the file has not changed since that action. Undoing a creation trashes the new file. |
| `src/cli/commands/remove.ts` `removeItem`; `src/plugin/actions.ts` `remove` | `wi rm` or plugin delete | Moves or deletes the file without editing its frontmatter. The prior date survives in a trashed copy when one is kept. |
| `scripts/fixture.ts` `renderRoot`, `render`, `generate`, `writeFixture` | `npm run fixture` or a fixture test | Generates test-vault files with dates relative to the supplied day, then replaces fixture-owned files. This is not a production vault writer. |
| `src/shared/templates.ts` `renderVaultTemplate`; `src/cli/commands/template.ts` `writeTemplates`; `test/Templates/work-item.md` | `wi template write`, then optionally Obsidian's Insert template | Writes `updated:` as an empty placeholder in a template file. `wi template write` leaves an identical template untouched. Inserting that template can put the blank field into a note; the user or another tool must fill it. |

## Rule and findings

A meaningful change to a card's body, status, or other frontmatter should set `updated` to the current date. Reading a card or requesting an edit that leaves its content unchanged must leave `updated` unchanged. Dates have day precision, so several real edits on one day can leave the visible date the same.

The CLI and plugin action paths stamp frontmatter changes. Their readers and renderers do not stamp: `src/cli/vault.ts` and `src/plugin/index.ts` parse, sort, and filter by the date, while `src/plugin/main.ts` responds to metadata and vault events by redrawing or reloading configuration. Its `modify` listener does not edit work items. `wi validate`, `wi children`, and the installed Git pre-commit hook only read work items; that hook runs `wi validate`.

Before this fix, `editItem` and the plugin's `edit` appended a date before testing whether the requested edit changed anything. An empty edit list, or a stale action that set a field to its existing value, could therefore advance `updated`. The shared `applyStampedEdits` now checks the requested edit first. `setKey` also preserves an existing line when its parsed value already equals the requested value, including a differently quoted but equivalent scalar. The CLI skips the disk write if the final text is unchanged. The plugin returns unchanged text from `Vault.process` in that case; whether Obsidian emits a filesystem modify event for that call depends on Obsidian's implementation, but this code does not change `updated`.

## Remaining gap and external writers

Editing a card's Markdown body or frontmatter directly in Obsidian is outside these actions. This plugin does not stamp those edits. Closing that gap needs a separate design and tests: the plugin would need to distinguish user edits from its own writes and sync changes, and the CLI has no body-edit command. A useful follow-up is to define how direct editor changes update the date without event loops or extra sync writes. The current plugin undo deliberately restores the previous date with the previous bytes, as required by `docs/adr/0019-guarded-board-undo.md`; decide whether that exception to the last-change interpretation should remain before changing undo.

This repository contains no vault-side hook that changes a card's `updated` field. Its optional Git hook validates only. The code cannot establish whether Obsidian core, another installed plugin, a template, a sync client, a user script, or a hook in a particular vault writes that field. Confirming an unexplained change requires checking that vault's installed plugins, hooks, automation, and file history; none was inspected here.
