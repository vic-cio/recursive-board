---
status: accepted
amends: docs/adr/0034-agent-limit.md (who counts), docs/adr/0042-creator-and-role.md (the full list of person notes for delegation)
amended_by: holder-names-who-does-the-work.md (the field is `holder`; delegating names the holder only)
---
# Delegate a card to a person or a headless agent

`wi delegate <ref> --to <person|agent|claude|codex|pi>` hands a card to someone. Delegating names
the holder and changes nothing else ([holder-names-who-does-the-work](holder-names-who-does-the-work.md)).
For a harness it names the worker as holder, makes the worktree, starts the worker as a headless
process, and notes who has the card and where the log is. For a person it only writes their name.
For `agent` it writes the reserved holder `agent`, which asks any agent, and starts nothing. One
command does what a dispatcher script did by hand. Hand-built launch lines failed in three ways: an update prompt ate the brief,
shell word splitting broke a loop, and the sandbox needed `--add-dir`.

## Delegating names the holder only

A delegated card carries the delegate's name in `holder` (it was `agent`), so it refuses a second
holder, and `wi release` works on it. Delegating never changes the status. If the status must
change, the delegator moves the card, or the holder does when they start. A worker runs
`wi claim <card> --agent <its name>` when it starts, and that claim moves the card to doing
([0014](0014-agent-claims.md)). Victor decided this on 2026-10-01: "a worker wouldn't want you
messing with their priority list". Until the worker claims it, the card sits in its old status
with the worker as holder. `owner` is not used: on the dashboard, a doing card that you own waits
for your review, which is a different thing.

For a person and for `agent`, `wi delegate` writes only the holder. It writes no note. There is no `--reason`: a worker reads the
card body as its brief, and a person explains a hand-off on the platform they talk on. Victor
decided both at the 0.8.0 review.

`wi` knows a person by a note with `type: person`, in any folder, as the plugin's people picker
does. `wi agents` does not count a doing card whose `agent` names a person, and `wi claim` gives no
limit warning for one. `wi delegate` refuses a name that is not a harness and has no person note,
because that claim would count as an agent. A harness name wins over a person note of the same
name. A vault with no person note knows no one, so every claim still counts, as before. 0042
rejected product-owned `People/` and `Roles/` folders, so the folder does not decide: the
frontmatter `type` does. Only delegation and the agent count read the full list of people.

The claim and the note are pure functions in `src/shared/delegate.ts`, so a plugin menu can run the
same step for a person.

## An agent gets a worktree and a detached process

- The worktree is made from the Git repository of the current directory, beside its main
  worktree: `<repo>-worktrees/<slug>`, on the branch `card/<slug>`. The slug comes from the card
  title. A new branch starts at the commit the delegating agent stands on, so a child's work
  builds on its parent's branch. A worktree already on that branch is used again, so a card
  delegated a second time carries on. Any other folder in the way is refused.
- The worker's name is its model and the card slug, `<model>-<slug>`, for example
  `gpt-6-luna-stop-copying-owner`. Without `--model` the harness stands in for the model:
  `<harness>-<slug>`. `--agent <name>` overrides both. The name is unique per card, so two workers
  on one model do not take each other's cards or count as one agent.
- The process starts detached in its own process group, with its output in
  `<repo>-worktrees/<slug>.log`. It outlives `wi` and the session that ran it. A prompt for stdin is
  kept beside the log as `<slug>.prompt.md`.
- The prompt names the card, the worker name, the worktree and the role, and tells the worker to
  run `wi claim` on its card when it starts. Then it gives the card body as the brief. The worker
  reads the rest from the board.
- The worker's environment sets `WI_VAULT`, `WI_CARD`, `WI_AGENT`, `WI_CREATOR` and `WI_MODEL`.
  `WI_CREATOR` is the card's role, from the nearest ancestor that has one, or `Worker`. Without
  `--model`, `WI_MODEL` is removed, so the worker does not report the delegating agent's model.
- The note gives the process id, the log path and the command that resumes the session. Claude
  and pi get a session id that `wi` chooses. Codex chooses its own, so the note says `codex resume`.

Every check runs before the first write: the target, the Git repository, the permission mode, the
worktree path, and every check `wi claim` makes for the worker's name, so a worker never starts on
a card it cannot claim. Then `wi` names the holder, makes the worktree and starts the process. If
the worktree or the process fails, `wi` gives the card back its holder from before (none, or
`agent`) and notes the reason. The status stays.

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
- **A name with no person note accepted as a person.** It would count as an agent in
  `wi agents`, and a typo in a harness name would pass silently.
- **The worktree inside the repository.** The repository would index the worker's files.
- **Refusing at the agent limit.** The limit stays advisory (0034). Waiting is the delegating
  agent's decision.
- **A bypass permission default.** A worker would run unchecked on any machine that runs `wi`.
