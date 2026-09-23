---
status: accepted
---
# The `wi` CLI is the programmatic write interface

Agents and scripts use the plain Node `wi` CLI to create, update, move, archive, and remove work items. Shared modules hold rules also used by the plugin, so both writers apply the same status and parent transitions. `wi validate` checks work-item identity, schema, parent links, cycles, and folder layout; it reports unknown frontmatter keys as warnings and preserves them.

The CLI works without Obsidian. This keeps filesystem access at the command boundary and leaves the shared rules usable in the plugin on desktop and mobile.

## Considered options

Letting each agent edit frontmatter directly would make integrity depend on instructions and hand-written edits. An MCP server or HTTP service would add another interface without changing the underlying CLI rules.
