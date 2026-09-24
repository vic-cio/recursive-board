---
status: accepted
supersedes: docs/adr/0028-area-work-items.md (conversion scope)
---
# Convert cards and areas with `wi area`

`wi area <ref>` converts a child card to an area. It sets `area: true` and removes `status` and
`prev_status`. It refuses a card with a non-empty `agent`: an agent means claimed work, which
should be released before the item changes kind. A card in `doing` with no agent converts. A
board that never finishes sits in doing, and that board is the main case for an area. Root items are not cards or areas
in this command and cannot be converted.

`wi area <ref> --off --status <status>` converts an area back to a card. The caller must choose
the new card status because an area has no status to restore. The command removes `area` and any
stale `prev_status`, then writes the requested status.

Both directions edit one Markdown file line-wise, stamp `updated`, and preserve the body and all
unrelated frontmatter keys. Markdown remains canonical.

## Considered options

Separate `wi area` and `wi card` commands would split one reversible operation across two names.
An explicit `--off` flag makes the direction visible while keeping the chosen status mandatory
when converting back. Guessing a status would silently invent workflow state.
