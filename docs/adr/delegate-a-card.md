---
status: accepted
amends: docs/adr/0034-agent-limit.md (who counts), docs/adr/0042-creator-and-role.md (a People/ folder for delegation)
---
# Delegate a card to a person or a headless agent

`wi delegate <ref> --to <person|claude|codex|pi>` hands a card to someone. It claims the card for
the delegate and adds a note that says who has it and why. For an agent it also makes the worktree,
starts the worker as a headless process, and notes the log. One command does what a dispatcher
script did by hand. Hand-built launch lines failed in three ways: an update prompt ate the brief,
shell word splitting broke a loop, and the sandbox needed `--add-dir`.

## A person holds a card through `agent`

A delegated card carries the delegate's name in `agent`, through the same claim as `wi claim`. So
a person's card refuses a second claimant, and `wi release` works on it. `owner` is not used: on
the dashboard, a doing card that you own waits for your review, which is a different thing.

`wi` knows a person by a note in the vault's `People/` folder. `wi agents` does not count a doing
card whose `agent` names a person, and `wi claim` gives no limit warning for one. `wi delegate`
refuses a name that is not a harness and has no `People/` note, because that claim would count as
an agent. A harness name wins over a person note of the same name. A vault with no `People/`
folder knows no one, so every claim still counts, as before. 0042 rejected product-owned
`People/` and `Roles/` folders for `creator`, `owner` and `role`; they still match a note anywhere.
Only delegation and the agent count read `People/`, because they need the full list of people.

The claim and the note are pure functions in `src/shared/delegate.ts`, so a plugin menu can run the
same step for a person.

## An agent gets a worktree and a detached process

- The worktree is made from the Git repository of the current directory, beside its main
  worktree: `<repo>-worktrees/<slug>`, on the branch `card/<slug>`. The slug comes from the card
  title. A new branch starts at the commit the delegating agent stands on, so a child's work
  builds on its parent's branch. A worktree already on that branch is used again, so a card
  delegated a second time carries on. Any other folder in the way is refused.
- The worker's agent name is `<harness>-<slug>`, unique per card, or `--agent <name>`.
- The process starts detached in its own process group, with its output in
  `<repo>-worktrees/<slug>.log`. It outlives `wi` and the session that ran it. A prompt for stdin is
  kept beside the log as `<slug>.prompt.md`.
- The prompt names the card, the agent name, the worktree and the role, then gives the card body
  as the brief. The worker reads the rest from the board.
- The worker's environment sets `WI_VAULT`, `WI_CARD`, `WI_AGENT`, `WI_CREATOR` and `WI_MODEL`.
  `WI_CREATOR` is the card's role, from the nearest ancestor that has one, or `Worker`. Without
  `--model`, `WI_MODEL` is removed, so the worker does not report the delegating agent's model.
- The note gives the process id, the log path and the command that resumes the session. Claude
  and pi get a session id that `wi` chooses. Codex chooses its own, so the note says `codex resume`.

Every check runs before the first write: the target, the Git repository, the permission mode and
the worktree path. Then `wi` claims the card, makes the worktree and starts the process. If the
worktree or the process fails, `wi` releases the claim with the reason.

## Harness lines

| Harness | Line | Prompt | `--permission` default |
|---|---|---|---|
| claude | `claude -p --model <id> --permission-mode <mode> --session-id <uuid> --name <card> --add-dir <vault>` | stdin | `auto` |
| codex | `codex exec -m <id> -s <sandbox> [-c sandbox_workspace_write.network_access=true] -C <worktree> --add-dir <vault> -` | stdin | `workspace-write` |
| pi | `pi -p --model <id> --session-id <uuid> --name <card> -- <prompt>` | argument | none |

`--permission` takes the harness's own value, checked against the values that harness takes. The
default is never a bypass. pi has no permission modes, so it refuses `--permission`. pi keeps its
session (no `--no-session`), so a person can open the run afterwards.

Claude Code's auto mode can block an agent that starts headless agents. `wi delegate` does not try
to get around that. The README tells the user to add `Bash(wi delegate *)` to the allow list in
user settings, because a worktree does not carry a project's `.claude/settings.local.json`.

## The agent limit

`wi delegate` warns when a new worker takes the count past `maxAgents`, as `wi claim` does. It does
not refuse. The delegating agent runs `wi agents` first and waits at the limit; the command does
not decide that for it.

## Tests

The process launcher is injected. The tests check every harness line as data, and run the command
with a fake launcher and a real temporary Git repository. One CLI test puts a stand-in `claude`
script first on a `PATH` that holds no real harness. No test starts an agent.

## Rejected

- **A person in `owner`.** It would put the card in the owner's review list, and leave the card
  open to a claim by an agent.
- **A name with no `People/` note accepted as a person.** It would count as an agent in
  `wi agents`, and a typo in a harness name would pass silently.
- **The worktree inside the repository.** The repository would index the worker's files.
- **Refusing at the agent limit.** The limit stays advisory (0034). Waiting is the delegating
  agent's decision.
- **A bypass permission default.** A worker would run unchecked on any machine that runs `wi`.
