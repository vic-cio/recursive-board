---
status: accepted
---
# Deliver objective chains at agent boundaries

`wi objective` is retired and exits successfully with directions to `wi show <ref> --json`. The refocus hook reads `WI_CARD` and calls `wi show <ref> --json`, then formats the card's Objective and ancestor Objectives from the JSON result. It stays silent when `WI_CARD` is unset, the command fails, or the result is invalid. It does not infer a card from `WI_AGENT`.

The hook marks a missing Objective. It reports a broken parent or cycle when `wi show` includes an ancestry issue. It bounds model-visible context.

The generic hook lives in `scripts/refocus.mjs` and ships beside the built CLI. Runtime configuration names use the `WI_REFOCUS_` prefix. `WI_REFOCUS=off` disables delivery. `WI_REFOCUS_BYTES` sets Claude's transcript growth threshold. `WI_REFOCUS_NOW` requests one delivery per setting value and session.

Claude delivers compaction context from `SessionStart` when `source` is `compact`. It checks transcript growth on `Stop` and delivers due context on `UserPromptSubmit`. Codex delivers compaction context from compact `SessionStart` and supports on-demand delivery on `UserPromptSubmit`. Fresh startup stays silent.

The hook is opt-in. Setup does not edit a user's Claude or Codex configuration. The published hook file and explicit registration recipes let each user choose where to enable it.

## Why

`WI_CARD` is the exact dispatcher choice. The `wi show --json` response already contains the card and ancestor Objectives, so a separate Objective command adds no needed data. The `WI_REFOCUS_` prefix keeps hook settings generic and groups related controls.

Claude and Codex expose different compaction boundaries. Claude's `PostCompact` discards `systemMessage` and `continue`. Codex ignores plain text from `PostCompact`. Their documented compact `SessionStart` events can add context before the model continues, so the hook uses those events.

## Sources

- [Claude Code hook reference](https://code.claude.com/docs/en/hooks)
- [Codex hook reference](https://learn.chatgpt.com/docs/hooks)
- [Refocus channel mechanism](https://raw.githubusercontent.com/mvschwarz/openrig/main/docs/reference/refocus-channel.md)
