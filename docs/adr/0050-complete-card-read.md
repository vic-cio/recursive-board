---
status: accepted
---
# Read one complete card through wi show

`wi show <ref> --json` returns one normalized card record. It uses the vault index, the shared section reader, and the existing dependency rules. The output includes the ancestor objective chain, raw Notes, and a child summary. It reports broken parent and dependency links instead of guessing targets.

The command reads the current Markdown files and writes nothing. An agent can use the stable card id to get its full brief without reading frontmatter or rebuilding the tree. The record is a snapshot, not a second source of work state.
