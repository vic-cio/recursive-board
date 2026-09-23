---
status: proposed
---
# Refuse tree-dependent writes when files are unaccounted for

The CLI treats a hidden non-Markdown file in the configured work item folder as unaccounted, except for known harmless files. `wi rm` and `wi move` refuse while any such file exists because an unread file could hide a descendant. `wi validate` warns about unaccounted files and reports duplicate ids as errors.

The source allows `wi new` and `wi archive` to proceed when an unaccounted file exists. The open decision is whether those commands should refuse too. The guard cannot detect online-only files that appear as ordinary files to the operating system.
