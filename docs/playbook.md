# Agent playbook

This playbook describes one agent setup that works with Recursive Board. It is optional. Recursive Board and `wi` work the same without it, and `wi validate` reports nothing when a vault does not follow it. Take the parts that suit your work, change them, or ignore them.

The setup lets a person and their agents work a tree of cards together. A session agent talks with the person. Workers do the work of each card, and any worker may split its card and start workers on the children. The board is the live record of who does what.

The playbook ships in the npm package at `docs/playbook.md`. Some sections are paste-ready texts in marked blocks. [Markers](#markers) says how code finds them.

## Recommended setup

```text playbook=summary
Recommended agent setup (optional). Recursive Board works the same without
it. The full text is docs/playbook.md in the recursive-board package.

1. Paste the "Agents and roles" section into the vault's AGENTS.md.
2. Make a Roles/ folder. Add one note for each kind of work, tagged
   role/<name>, and the shared Dispatching procedure note.
3. Add a person note (type: person) for each reviewer.
4. Set the agent limit: Settings > Recursive Board > Dispatcher.
5. Start each worker as a headless process, in its own Git worktree when
   the work is code. Your harness starts it. wi starts no agent.
6. Wait for workers in the foreground, merge each result into your own,
   and send the top card for review with wi review.
```

## Terms

- **Worker**: an agent that holds a card, including one that splits its card and starts workers on the children.
- **Session agent**: the top worker. Its person is attached to it in a live session.
- **Headless worker**: a worker that runs as its own process, with no person attached. It ends when its turn ends.
- **Holder**: the person or agent who does a card's work now. `wi claim` sets it.
- **Owner**: the person who is accountable for a card and gives its verdict.
- **Verdict**: an approve or a send-back on a card that was sent for review.
- **Role**: a tag such as `role/coder` on a card. The note that carries the same tag is its procedure.
- **Dispatching procedure**: the shared note that tells any worker how to split its card and start workers.

## The setup

The vault holds these parts:

| Part | What it is |
| --- | --- |
| `AGENTS.md` at the vault root | The rules for every agent in the vault, with the [Agents and roles](#agents-and-roles) section. |
| `Roles/` | One note for each kind of work, such as [Coder](#example-role-note-coder), and the [Dispatching procedure](#dispatching-procedure). |
| Person notes | One note with `type: person` for each person who reviews or holds cards, for example in `People/`. `wi review` and `wi delegate` need them. |
| `maxAgents` | The agent limit in the board settings. The session agent and every worker read it before they start a worker. |
| The `recursive-board` skill | `wi setup` installs it. Its "Working as a worker" section is the base procedure for every worker. |

The flow of one piece of work:

1. The person names a card to the session agent.
2. The session agent writes the brief, tags the card with a role, and starts a worker on it.
3. The worker claims the card and reads its brief and its role note.
4. When the card is too big for one agent, the worker splits it and starts a worker on each child, as the Dispatching procedure says. Each child may do the same.
5. Each worker merges its children's results into its own, and closes each child.
6. The top worker sends its card for review with `wi review`. The owner gives the verdict.

## Agents and roles

Paste this section into the vault's `AGENTS.md`. Change the folder names when your vault uses others.

```markdown playbook=agents-and-roles
## Agents and roles

Every agent on a card is a worker. Work a card as the recursive-board skill's "Working as a worker"
section says, and change only your own card and its children.

- The session agent is the top worker, with its person attached. It does the conversation and the
  board admin itself: cards, briefs, moves, status changes. It gives each card's real work to a
  worker. When a card waits only on a person's check, it runs
  `wi review <card> --to <person> --note "<what to check>"`.
- `Roles/` holds a procedure for each kind of work, such as `Roles/Coder.md`. A role is a tag such
  as `role/coder` on a card. The note that carries the same tag is its procedure:
  `wi show <card> --json` lists it under `procedures`. A role tag does not pass down, so tag each
  card. A card with no role tag needs only the skill section.
- `Roles/Dispatching.md` is the shared Dispatching procedure. Every worker reads it together with
  its role note. Any worker may split its card and start workers on the children, as headless
  processes. The agent limit is `maxAgents` in the board settings.
- wi starts no agent. Start a worker with your harness's own tools. Sign notes with `WI_AGENT` and
  `WI_MODEL`.
- Tests and scripts use fixtures and temporary folders, never this vault.
- Before a session ends, keep work in progress in doing, with a `wi note` that says where it is
  and what is next. Make each next step a card in options with a brief.
```

## Example role note: Coder

A role note is a procedure for one kind of work. Save this one as `Roles/Coder.md`. The tag in its frontmatter is the whole link: every card tagged `role/coder` uses it. Write a note like it for each other kind of work.

```markdown playbook=role-note
---
description: "An agent that changes code in a Git repo on one card, on its own branch, and merges its children's branches into it."
tags: [role/coder]
---

## Purpose

Change code for one card on its own branch, with passing tests. Merge the branches of the card's
children into that branch. Only the top card's branch waits for the owner's verdict, and only that
branch reaches the main branch.

## Procedure

1. Follow the recursive-board skill's "Working as a worker" section: claim, split into children,
   claim each child before its work, note, close.
2. Work in the worktree and on the `card/<slug>` branch that your parent gave you. With none, make
   a worktree from your parent card's branch, else from the main branch.
3. Change only the files your card needs. Leave the files the brief names as off limits. Note a gap
   that you see elsewhere on your card.
4. Run the repo's tests, and commit on your branch. Tests and scripts use the repo's fixtures,
   never the vault.
5. When a child needs its own worker, follow the Dispatching procedure: write the child, give it a
   branch and worktree from yours, and start its worker.
6. Merge each finished child branch into your branch:
   1. Rebase the child branch onto yours, detached.
   2. Run `git grep -n -E '^(<<<<<<<|>>>>>>>) '`, and stop on a hit.
   3. Run the tests on the rebased commit.
   4. Fast-forward your branch to it.
   5. Run `wi validate` when the change touches the vault.
7. Leave shared machine state alone: running servers, the Obsidian app, and global agent settings.
   Write in a note what to run, and the session agent runs it.
8. Finish:
   - On a card under another worker's card, note the result and the branch:
     `wi note <card> "<result>, branch <name>"`. Your parent merges it and closes the card.
   - On the top card, leave it in doing, and run
     `wi review <card> --to <person> --note "<what each child did, and what to check>"`.
     Merge, push and publish wait for the verdict.
```

## Dispatching procedure

Dispatching is a procedure, not a role, so its note carries no role tag. Every worker reads it together with its role note, so no role note copies its steps. Save it as `Roles/Dispatching.md`.

Step 4 gives a launch line for Claude Code. Claude Code is one harness. Use your own harness's command for a run with no prompts, and read [Bypass permissions](#bypass-permissions) before you use one.

```markdown playbook=dispatching
---
type: procedure
description: "Dispatching: the shared procedure any worker follows to split its card and start workers on the children. Every worker reads it with its role note."
---

## Purpose

Split a card into child cards, give each child to a worker, and follow them to done. Any worker may
start workers. A worker whose card is too big for one agent splits it and starts one worker per
child, and each child may do the same. The session agent is the top worker.

## Procedure

1. Split the card. Give each child a full brief and its role tag:
   `wi new "<title>" --parent <card> --status options --tag role/<name> --objective <text> --context <text> --criteria <text>`.
   A role tag does not pass down, so tag every child. In a `--context`, name the files that the
   worker must not touch.
2. Choose the harness and the model for each worker. Use what the child card or its role note
   names. Otherwise use your own.
3. Read the agent limit: `wi dashboard --panel agents --json`. When `activeAgents` reaches
   `maxAgents`, wait until a worker finishes before you start the next one. `null` means no limit.
4. Start each worker as a headless process in the background. wi starts no agent. For Claude Code
   with bypass permissions:
   `WI_AGENT=<name> WI_MODEL=<model> claude -p --permission-mode bypassPermissions --model <model> "<prompt>" < /dev/null > <run folder>/<child id>.log 2>&1 & echo $!`
   - For another harness, use its headless command, such as `codex exec` or `pi -p`, with the same
     environment.
   - Put the run folder outside the vault.
   - The prompt gives the card id and the branch or worktree. It tells the worker to claim the card
     with `wi claim <child>`, read its brief with `wi show <child> --json`, and follow this note and
     its role note. A headless worker cannot receive a message while it runs, so put everything in
     the prompt.
   - Keep the process id that `echo $!` prints.
5. Record each event on the child card: `wi note <child> "<start, finish, retry or stop>: <detail>"`.
   The start note gives the process id and the log path.
6. A few minutes after a start, run `wi children <child>` and read the log. A worker that has
   written nothing by then is stalled. Restart it, or release its card.
7. Wait for your workers in the foreground: `while kill -0 <pid> 2>/dev/null; do sleep 30; done`
   for each process id. Repeat the command when it reaches the shell timeout. A headless worker
   ends when its turn ends, so never wait in a background task and end your turn. `wait` does not
   work across shell calls. When a process ends, read its child card. A child that is not done or
   released when its process ends has stopped early. Run
   `wi release <child> --reason <why> --where <branch-or-path>`.
8. When a worker finishes, check its result against the child's criteria. Merge its result into
   your own card's result, as your role note says. Then run `wi status <child> done` at once: a
   finished child in doing with a holder still counts against `maxAgents`.
9. When the last child is done, check your own card's criteria, and finish it as your role note
   says. Only the top card waits for the owner's verdict. A child that made a decision the owner
   must see gets its own `wi review <child> --to <person>`.

To give a card to a person instead, run `wi delegate <card> --to <person>`. The person needs a note
with `type: person`.
```

## Bypass permissions

In this setup every worker is a headless process, so no person is there to answer a permission prompt. The launch line above uses Claude Code's `bypassPermissions` mode, which runs every command with no prompt. Other harnesses have similar modes.

Know the risk before you use it:

- A worker in bypass mode can run any command that your user account can run. A bad brief or a confused worker can change or delete files outside its card, in the repo or in the vault.
- A worker can also send data to the network, push a branch, or publish a package, if its tools let it.

These steps make the risk smaller. They do not remove it.

- Give each code worker its own Git worktree and branch. Review the diff before you merge it.
- Name the files that a worker must not touch in its brief, and check the diff for them.
- Keep tests and scripts on fixtures and temporary folders. Keep the vault under version control, so you can undo a bad write.
- Tell each worker in its prompt what it must never do, such as push, tag, publish or touch shared machine state.
- Run workers in a container or a sandbox when your harness supports one.

For less risk, use an allow list of commands in your harness's permission settings in place of bypass. A worker then stops at a command that is not on the list. The cost is that a stopped headless worker waits for an answer that never comes, so watch the logs.

## Lessons from runs

These lessons come from runs of this setup on real boards.

- **Wait in the foreground.** A headless worker ends when its turn ends. A parent that waits in a background task and ends its turn stops, and its children run on with no one to merge them. Loop on `kill -0 <pid>` in the foreground, and repeat the loop when the shell times out.
- **Keep each process id.** `wait` does not work across shell calls, because each call starts a new shell. Print the id with `echo $!` in the call that starts the worker, and write it in the start note.
- **`maxAgents` caps live agents, not processes.** It counts agents that work a doing card. A parent whose open children are all in doing only waits on its steps, so it does not count, and the tree can be as deep as it needs. The limit is advisory, and two workers that start at the same time can pass it by one or two.
- **A held card counts as an agent.** A finished child that stays in doing with its holder still counts until its parent closes it or it is released. Close each child when you merge it. A card sent for review with `wi review` stops counting.
- **Tell the worker everything in the prompt.** A headless worker cannot receive a message while it runs.
- **Close stdin.** Some headless commands wait for input when stdin is open, and never start. Add `< /dev/null`.
- **Check for a stall early.** A few minutes after a start, read the log and the child card. A worker that has written nothing is stalled.
- **Name the files a worker must not touch.** A worker that sees a gap will fix it, also outside its card. Check the diff for those files at review.
- **Test the rebased commit before the fast-forward.** A hand-resolved conflict can drop code and still compile.
- **Search for conflict markers after each rebase.** Markers inside a string can compile and pass every test.
- **Merge first the change that the others build on.** Parallel changes to shared files conflict often.
- **Check every path to a new feature.** A worker checks its own card, not each place where the item appears.
- **Read each new decision against the open cards.** A worker's decision can reach past its card.

## Checks

These are the recommendations that a check of a vault against this playbook can look for. Each line starts with a check id.

```text playbook=checks
agents-md         The vault root has AGENTS.md with an "Agents and roles" heading.
dispatching-note  The Dispatching procedure note exists (Roles/Dispatching.md here).
role-notes        Each role tag on an open card has a note that carries it.
person-note       At least one note has type: person, so wi review has a reviewer.
max-agents        The board settings set maxAgents to a whole number.
skill             The recursive-board skill is installed for the agent harness.
background-wait   No role or procedure note tells a worker to wait in a background task.
```

## Markers

Code reads this file. Keep these markers when you change it. `docs/adr/0067-the-playbook-ships-with-marked-blocks.md` records them.

- A paste-ready text is a fenced code block. The info string of its opening fence holds a word `playbook=<name>`. The names are `summary`, `agents-and-roles`, `role-note`, `dispatching` and `checks`. Each name appears once.
- A check line in the `checks` block is a check id, two or more spaces, and the text.
- The `Changes` section has one `###` heading for each version that changed the playbook, newest first. The next release is `Unreleased` until the release names it.

## Changes

### Unreleased

- First version: the recommended setup, the Agents and roles section, an example Coder role note, the Dispatching procedure, bypass permissions and their risk, lessons from runs, and the checks.
- The `background-wait` check finds a role or procedure note that still tells a worker to wait in a background task.
