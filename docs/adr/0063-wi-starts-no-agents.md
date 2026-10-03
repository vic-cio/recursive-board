---
status: accepted
amends: docs/adr/0058-delegate-a-card.md (the harness launch goes), docs/adr/0042-creator-and-role.md (the creator flags go)
---
# wi starts no agents

wi is a board tool. It reads and writes cards. It does not start agents, pick a harness, or pass
a permission mode. Each harness starts agents with its own tools, such as a subagent, a background
task or another session, and those tools already handle permissions and sandboxes.

## The decision

- `wi delegate <ref> --to <person|agent> [--role <name>]` sets the holder and nothing else. It
  makes no worktree, starts no process and writes no note. `--to claude|codex|pi`, `--model`,
  `--agent` and `--permission` go. A name with no person note is refused, harness names included.
- An agent takes a card with `wi claim <ref>`. The holder is `--holder <name>`, else `WI_AGENT`.
- `wi show <ref> --json` is the brief. Besides the card and its ancestors' Objectives, it lists
  each role tag on the card with the notes that carry it (`procedures`), which the worker prompt
  used to name.
- The flags that set a holder are called `--holder`: `wi new --holder`, `wi claim --holder` and
  `wi ready --holder`. `wi note --agent` stays, because it names the writer, not the holder.
- `wi new` and `wi set` drop `--creator` and `--model`. Cards no longer record their creator. Old
  `creator` fields stay valid and are preserved.
- `wi release --reason` stays required, so the hand-over is never blank and is written in the same
  write as the release. Its note is signed and timed like `wi note`: by `WI_AGENT`, else the holder.
- `wi agents` and `wi here` leave the usage list. Their retired stubs still exit 0 with a pointer.

## Rejected

- **Keep the harness launch as an option.** It baked three harnesses, their flags and their
  permission defaults into a board tool, and it needed a Claude Code allow rule to run in auto mode.
  The harnesses already do this better.
- **Make `--reason` optional and let agents write a `wi note` first.** An agent that stops between
  the two commands leaves a card back in options with no explanation.

Decided by Victor on 2026-10-03, before the 0.8.0 release.
