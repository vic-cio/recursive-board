---
status: accepted
---
# Print objective chains and deliver them at agent boundaries

`wi objective [<ref>]` prints the selected work item's Objective and each ancestor Objective up to the root. Without `<ref>`, it uses `WI_CARD`. When `WI_CARD` cannot resolve, it uses `WI_AGENT` only when one deepest doing claim has a valid parent chain.

The output marks a missing Objective. It stops at a broken parent, cycle, or output limit. It never guesses a parent.

The generic hook lives in `scripts/refocus.mjs` and ships beside the built CLI. Runtime configuration names use the `WI_REFOCUS_` prefix. `WI_REFOCUS=off` disables delivery. `WI_REFOCUS_BYTES` sets Claude's transcript growth threshold. `WI_REFOCUS_NOW` requests one delivery per setting value and session.

Claude delivers compaction context from `SessionStart` when `source` is `compact`. It checks transcript growth on `Stop` and delivers due context on `UserPromptSubmit`. Codex delivers compaction context from compact `SessionStart` and supports on-demand delivery on `UserPromptSubmit`. Fresh startup stays silent.

The hook is opt-in. Setup does not edit a user's Claude or Codex configuration. The published hook file and explicit registration recipes let each user choose where to enable it.

## Why

`objective` names the data the CLI emits. `refocus` names the runtime feature. The `WI_REFOCUS_` prefix keeps its settings generic and groups related controls.

`WI_CARD` is the exact dispatcher choice. The agent fallback supports existing sessions, while requiring one deepest valid claim prevents a guessed branch.

Claude and Codex expose different compaction boundaries. Claude's `PostCompact` discards `systemMessage` and `continue`. Codex ignores plain text from `PostCompact`. Their documented compact `SessionStart` events can add context before the model continues, so the hook uses those events.

## Sources

- [Claude Code hook reference](https://code.claude.com/docs/en/hooks)
- [Codex hook reference](https://learn.chatgpt.com/docs/hooks)
- [Refocus channel mechanism](https://raw.githubusercontent.com/mvschwarz/openrig/main/docs/reference/refocus-channel.md)
