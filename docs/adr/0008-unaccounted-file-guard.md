---
status: accepted
---
# Refuse tree-dependent writes when files are unaccounted for

The CLI treats a hidden non-Markdown file in the configured work item folder as unaccounted, except for known harmless files. `wi rm`, `wi move`, and `wi archive` refuse while any such file exists because an unread file could hide a descendant. `wi validate` warns about unaccounted files and reports duplicate ids as errors.

`wi new` proceeds and warns that its new id or filename may clash with an unread file. Capture must keep working during sync lag. The clash is very rare, and `wi validate` reports it. The guard cannot detect online-only files that appear as ordinary files to the operating system.
