---
status: accepted
amends: 0025-agent-setup.md (setup offers no hook), 0069-setup-prints-the-recommended-setup.md (the hook offer is gone), 0070-wi-doctor-checks-on-request.md (the hook check reads the file)
---
# Git versioning is advice, and `wi` installs no hook

Recursive Board stays small: the plugin, the shared rules, and `wi` for agents. Git is optional
(AGENTS.md, "No forced workflow"), and a solo user with no agents does not need it. Until now `wi
setup` offered a Git pre-commit hook for a Git vault, and `wi hook install`, `uninstall` and
`status` managed it. The hook ties a Git vault to a Node install. That runs against the aim to make
Node optional. Git versioning moves out of the commands and into the docs.

## The decision

- **`wi setup` makes no hook offer.** After the vault choice and the skill copies it asks nothing.
  `--yes` and `--json` are unchanged.
- **`wi hook` is removed.** `wi hook` is an unknown command, and an old script that runs
  `wi hook install` fails. Victor chose a full removal over a retired stub on 2026-10-08: he is the
  only user, and a stub would keep a command that does nothing in the help. A hook that
  `wi hook install` wrote earlier keeps working, because it calls `validate` directly. Deleting
  `.git/hooks/pre-commit` removes it.
- **The playbook and the README give the advice.** The playbook has a "Git versioning" section:
  when versioning pays off, a pre-commit snippet to copy, and the points that make a hook fail
  (0067 lists the `git-hook` block). The README shows the same snippet, and a test checks that the
  two copies match. The snippet names three absolute paths: Node, `wi.js` and the vault. A Git GUI
  client starts a hook without the shell `PATH`, so a bare `node` or `wi` may not be found. The
  snippet runs `wi.js` with Node, because the `wi` command starts with `#!/usr/bin/env node`.
- **`wi doctor` still reports the hook, and only reads it.** The `hook` check finds the
  pre-commit file as Git finds it (`git rev-parse --git-path`, so `core.hooksPath` counts). It
  passes when a line that is not a comment names `validate`. It is a note when there is no hook,
  when the hook does not validate, and when the file is not executable. It is never a fix and it
  prints nothing to paste.
- **`wi validate` is unchanged.** It still exits 1 on errors, so it works in any hook.

## Rejected

- **Keep `wi hook` as an advanced command.** It keeps the Node tie, and each command surface
  must then be kept in step by hand. The advice costs a reader one file to copy.
- **A snippet that calls `wi` by name.** It works in a terminal and fails from a Git GUI client.
- **Remove `wi hook` with no stub.** A script that runs it would fail where it passed before.
  A release keeps the workflows that users have.
