# Card order: design and migration

## Current behavior

The CLI index and plugin independently sort each parent's children by numeric `priority`
ascending (missing values last), then `updated` descending, then filename. A board filters
that sorted list into status columns; a checklist keeps the sibling list. There is no
position field or positional drag target. Today a status change or reparent edits one child
file, but it cannot place that card between chosen neighbors. Changing `priority` or
`updated` to simulate a precise reorder can disturb other cards' placement and may call
for editing several files. `updated` also determines the Done window, so it is a poor
surrogate for position.

## Choices

All counts below concern an ordinary move. Each scheme needs a stable tie-breaker when
Mac and phone independently choose the same position. Syncing edits to the *same* Markdown
file can still produce a file conflict; an order key does not solve that.

| Scheme | Files per move | Repeated inserts in one gap | Concurrent moves on different files | YAML and migration |
| --- | --- | --- | --- | --- |
| Integer gaps, e.g. `1000`, `2000` | One until a gap fills, then several or all siblings for renumbering. | Fixed width until exhaustion; a hot gap eventually forces renumbering. | Equal chosen integers need a tie-breaker. Concurrent renumberings can conflict across many files. | Easy to read. Assign spaced integers to every sibling in current order once. |
| Decimal midpoint | One with arbitrary-precision decimal strings; fixed-precision numbers eventually force renumbering. | About one extra decimal digit per few halvings of the same gap; 10,000 halvings make a very long key. | Identical midpoints need a tie-breaker. Separate files merge, but duplicate positions remain. | Familiar at first, then long decimal strings. Assign initial decimals to every sibling; never use JS floating-point arithmetic to generate them. |
| Base-62 string with integer ends and fractional gaps | One; no routine rebalance. | Fractions grow in a hot *interior* gap, but integer steps at front and back remain short. | Identical keys need a deterministic tie-breaker and a deliberate collision repair path. Separate files can merge without rewriting neighbors. | Compact ASCII scalar, e.g. `pz00`, `pz00_V`; less human-readable than numbers. Assign keys to every sibling in current order once. |
| LexoRank-style buckets | Usually one; rebalancing updates many ranks. | Rank length grows until a bucket needs balancing. | Equal ranks still need a tie-breaker; concurrent balancing needs coordination or can cause broad conflicts. | Rank strings carry bucket syntax. Migration assigns ranks to all siblings and introduces balance state and rules. |

The [Figma write-up](https://www.figma.com/blog/realtime-editing-of-ordered-sequences/)
explains fractional positions and the duplicate-position problem. Figma can resolve a
collision on its server. This vault has no such authority. The
[`fractional-indexing` package](https://github.com/rocicorp/fractional-indexing)
uses variable-length base-62 keys and integer prepend/append steps; its key format and
examples informed this choice. The module here has its own format and is **not**
byte-compatible with that package. [Atlassian's LexoRank documentation](https://support.atlassian.com/jira/kb/jira-software-data-center-lexorank-indexing-lag/)
describes the write amplification of rebalancing.

## Recommendation and prototype

Use the dependency-free `src/shared/card-order.ts` prototype. `keyBetween(lower, upper)`
returns one key strictly inside the bounds, where `null` is an unbounded end.
`keysBetween(lower, upper, count)` spaces a batch of keys. Keys have a signed base-62
integer anchor and an optional base-62 fractional suffix after `_`. Front and back
inserts step the integer anchor, so 10,000 front inserts stay within 12 characters in
the test. An interior hot gap can still grow without bound; monitor key length before
setting a maximum or designing a rare repair operation.

Compare keys by ASCII code-unit order (`a < b` / `a > b`), **never** `localeCompare`.
The module rejects malformed, duplicate, and reversed bounds. Its output is a plain
YAML scalar. Keep the field on the child item, alongside its parent and status.

## Migration and rollout

This prototype does not change shipped behavior. A later implementation should:

1. Add an `order` field to the shared schema, frontmatter editor, CLI reader and writer,
   plugin reader and writer, and validator. Both readers must use the same comparator:
   order key first, then stable `id` (or filename when the id is invalid) for equal keys.
   Keep `priority` as metadata; it stops controlling placement after migration.
2. Run an explicit, single-device migration while Sync is settled. For each parent,
   take the current sibling order from the existing comparator and assign evenly spaced
   keys to **all** children. Preserve the order of checklists as well as each board
   column. Each child's new key is a one-line frontmatter edit. Make the command
   previewable and idempotent; take a vault backup before committing the batch. A
   mixed keyed/unkeyed comparator can be non-transitive, so do not partly enable key
   sorting during a batch.
3. Make new children and positional moves obtain a key from visible neighboring cards
   in the target parent's child list. Status changes and reparenting update only the
   moved child's file, including its new `order` when placement changes. Keep the
   existing `updated` and Done-window rules independent of order.
4. If offline devices choose the same key, show both cards in stable `id` order and
   surface the collision. A later explicit repair can change one colliding child's key
   after Sync settles. Inserting *between* equal keys cannot be guaranteed as a
   one-file operation until that collision is repaired. If both devices move the same
   card, normal file-conflict recovery still applies. Test these cases with two vault
   copies before enabling positional drag and phone controls.

Do not auto-migrate on plugin load: opening the vault on two devices must not launch
competing multi-file rewrites. Existing vaults should retain their current ordering
until the explicit migration completes.
