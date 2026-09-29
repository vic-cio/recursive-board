# Refocus hook

The refocus hook sends the active card's Objective and each parent Objective. It helps an agent check that its current work still serves its card.

The hook is opt-in. It reads the vault through `wi objective`. It does not change work items.

## Install the files

Install `recursive-board` globally:

```sh
npm install --global recursive-board
```

The package includes `dist/wi/refocus.mjs` and `dist/wi/wi.js`. Run `npm root -g` to find the global package folder. Set `WI_BIN` to its `recursive-board/dist/wi/wi.js` file.

## Configure Claude Code

Add these entries to `.claude/settings.json` or `~/.claude/settings.json`. Replace both path placeholders with absolute paths. Keep the other settings in the file.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "compact",
        "hooks": [
          {
            "type": "command",
            "command": "WI_REFOCUS_RUNTIME=claude WI_BIN=\"/path/to/recursive-board/dist/wi/wi.js\" node \"/path/to/recursive-board/dist/wi/refocus.mjs\""
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "WI_REFOCUS_RUNTIME=claude WI_BIN=\"/path/to/recursive-board/dist/wi/wi.js\" node \"/path/to/recursive-board/dist/wi/refocus.mjs\""
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "WI_REFOCUS_RUNTIME=claude WI_BIN=\"/path/to/recursive-board/dist/wi/wi.js\" node \"/path/to/recursive-board/dist/wi/refocus.mjs\""
          }
        ]
      }
    ]
  }
}
```

Claude sends `source: compact` after a compaction. The hook adds context at that boundary. It measures transcript growth at `Stop`, then adds context with the next `UserPromptSubmit` event.

## Configure Codex

Add these entries to `~/.codex/config.toml`. Replace both path placeholders with absolute paths. Keep the other settings in the file.

```toml
[[hooks.SessionStart]]
matcher = "^compact$"

[[hooks.SessionStart.hooks]]
type = "command"
command = "WI_REFOCUS_RUNTIME=codex WI_BIN=\"/path/to/recursive-board/dist/wi/wi.js\" node \"/path/to/recursive-board/dist/wi/refocus.mjs\""

[[hooks.UserPromptSubmit]]

[[hooks.UserPromptSubmit.hooks]]
type = "command"
command = "WI_REFOCUS_RUNTIME=codex WI_BIN=\"/path/to/recursive-board/dist/wi/wi.js\" node \"/path/to/recursive-board/dist/wi/refocus.mjs\""
```

Codex sends `source: compact` before the next model request. The hook returns `hookSpecificOutput.additionalContext`. The `PostCompact` event does not deliver plain text as context.

Open `/hooks` in Codex and review the exact command before trusting it.
Codex skips new or changed hooks until you trust their current definitions.
Keep this registration opt-in and keep existing hook entries.

## Choose when the hook runs

The default hook is enabled after registration. Set environment variables in the command or agent environment.
Set `WI_VAULT` when the agent cannot find the intended vault from its working folder or repo pointer.

| Setting | Effect |
| --- | --- |
| `WI_REFOCUS=off` | Disable every refocus event. |
| `WI_REFOCUS=on` | Enable compaction delivery and Claude transcript growth. This is the default. |
| `WI_REFOCUS=threshold` | Alias of `on`. Use `WI_REFOCUS_BYTES` to change the transcript growth threshold. |
| `WI_REFOCUS_BYTES=2600000` | Set Claude's transcript growth threshold in bytes. The default is 2,600,000 bytes. |
| `WI_REFOCUS_NOW=1` | Request one refocus when the next user prompt arrives. Unset or change its value before you request another refocus. |
| `WI_CARD=wi-...` | Select one work item directly. This takes priority over `WI_AGENT`. |
| `WI_AGENT=codex` | Select the deepest doing claim when every claim lies on one valid ancestor chain. Claims on separate branches stay silent. |
| `WI_VAULT=/path/to/vault` | Select the vault when normal `wi` lookup cannot find it. |

`wi objective <ref>` runs without a hook. It shows missing Objectives with `[Objective missing]`. It stops and reports a missing parent or cycle. The output has a fixed limit.

Hook failures stay silent. A missing card, invalid event input, unreadable transcript, or failed `wi` command does not stop the agent turn.

## Check the hook

Run the synthetic fixture tests with:

```sh
node --test scripts/refocus.test.mjs src/cli/commands/objective.test.ts
```

Then check a real compaction in an isolated Claude or Codex session. The hook configuration is user-owned, so this check must not use an active work session.

## Runtime sources

- [Claude Code hook reference](https://code.claude.com/docs/en/hooks): `SessionStart`, `Stop`, `UserPromptSubmit`, and `PostCompact` inputs and outputs.
- [Codex hook reference](https://learn.chatgpt.com/docs/hooks): `SessionStart` and `UserPromptSubmit` support model-visible context. Plain output from `PostCompact` is ignored.
- [Refocus channel mechanism](https://raw.githubusercontent.com/mvschwarz/openrig/main/docs/reference/refocus-channel.md): bounded delivery at model-visible session and prompt boundaries.
