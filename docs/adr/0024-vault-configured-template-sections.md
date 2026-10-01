---
status: accepted
---
# Keep the built-in work-item template generic

The built-in `work-item` template contains sections that apply across vaults. A vault can append its own section headings through `extraSections` in the vault config. The plugin and `wi new` use the setting when creating items. Each added section starts empty, like the built-in sections. An empty bullet drew a lone dot under the heading, so no section has one (amended in 0.8.0). Template bodies stay in code. `wi template` is a retired command and does not write template files. [ADR 0048](0048-synced-vault-config-note.md) defines the config source.

This keeps personal note structure out of the product default while allowing automated creation to preserve a vault's chosen structure. Reading an editable Markdown template as the source for new items would let malformed or stale template files affect the writers, so the shared renderer remains authoritative.
