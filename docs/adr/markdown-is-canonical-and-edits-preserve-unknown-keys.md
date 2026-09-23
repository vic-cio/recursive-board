---
status: accepted
---
# Markdown files are canonical and edits preserve unknown keys

A work item's frontmatter and body hold its state. The plugin renders that state, while the CLI and plugin use shared rules for schema, status transitions, templates, and labels. A change to an item's status or parent is stored on that item; it does not update a parent or its children.

Frontmatter edits change only the requested key and preserve other lines and unknown keys byte for byte. This keeps existing notes intact and lets future tools read the canonical files without depending on the plugin.

## Considered options

Storing children or board state in a parent would make one operation touch multiple files and create conflicting copies of the relationship. Re-serializing frontmatter could rewrite fields a tool does not understand.
