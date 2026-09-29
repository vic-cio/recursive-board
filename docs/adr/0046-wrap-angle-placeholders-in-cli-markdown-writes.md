---
status: accepted
---
# Wrap bare angle placeholders in CLI Markdown writes

`wi new` and `wi note` wrap bare angle placeholders in backticks in Markdown body text. A shared,
pure Markdown helper applies the rule to both write paths. It preserves code spans, fenced code,
links, autolinks, and HTML.

Bare placeholders can look like HTML in Markdown. Backticks make them readable without changing
their words. A shared helper keeps both CLI paths consistent and remains usable by the plugin.

## Considered options

Warn and leave the text unchanged, or reject the write until the author adds backticks. Automatic
wrapping keeps the write readable and adds no correction step. The helper protects existing
Markdown structures so the change stays limited to the placeholder markup.
