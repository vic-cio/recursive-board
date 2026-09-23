---
status: accepted
---
# Keep the built-in work-item template generic

The built-in `work-item` template contains sections that apply across vaults. A vault can append its own section headings through `extraSections` in `.wi.json`. Both writers use the setting when creating items, and `wi template write` includes the same sections in generated templates. Each added section starts with an empty bullet.

This keeps personal note structure out of the product default while allowing automated creation to preserve a vault's chosen structure. Reading an editable Markdown template as the source for new items would let malformed or stale template files affect the writers, so the shared renderer remains authoritative.
