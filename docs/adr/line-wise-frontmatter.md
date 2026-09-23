---
status: accepted
---
# Edit only the requested frontmatter lines

The plugin and `wi` change frontmatter line by line. They preserve all other bytes, including unknown keys and formatting, instead of parsing and reserializing the whole YAML block. This keeps a one-field change local and prevents a writer from erasing data it does not understand.

## Considered options

Reserializing YAML would normalize unrelated lines and could drop or alter content outside the requested edit.
