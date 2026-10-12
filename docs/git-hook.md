# Version the vault with Git (optional)

Git is optional. Recursive Board works without it, and a solo user with no agents does not need it. It pays off when a team grows or when agents write to the vault, because each commit is a point that you can go back to.

If your vault is a Git repository, a pre-commit hook can run `wi validate` and stop a commit when the vault has errors. The hook needs Node and `wi`. Save this snippet as `.git/hooks/pre-commit`, replace the three paths with absolute paths, and run `chmod +x .git/hooks/pre-commit`:

```sh
#!/bin/sh
# Check the vault before each commit. To skip the check once: git commit --no-verify
exec "/absolute/path/to/node" "/absolute/path/to/wi.js" validate --vault "/absolute/path/to/vault"
```

To set it up:

1. Find the path of Node: `command -v node`.
2. Find the path of the `wi` entry point: `echo "$(npm root -g)/recursive-board/dist/wi/wi.js"`.
3. Save the snippet as `.git/hooks/pre-commit` in the repository. Replace the three paths. When the vault is a subfolder of the repository, name the subfolder.
4. Make the file executable: `chmod +x .git/hooks/pre-commit`.
5. Run `wi doctor`. Its `hook` check reads the file and writes nothing.

Keep these points in mind:

- **Absolute paths.** A Git GUI client starts the hook without your shell `PATH`, so a bare `node` or `wi` may not be found. The snippet runs the `wi.js` file with Node, and not the `wi` command, because the `wi` command starts with `#!/usr/bin/env node`, which needs `node` on the `PATH`.
- **A path that changes.** An upgrade of Node can change its path. Use the path that `command -v node` prints. Do not use the folder that this path links to, because a package manager can put the version in that folder name.
- **A hook that cannot run.** Git refuses every commit while the hook fails. Skip it once with `git commit --no-verify`, then correct the paths.
- **Remove it.** Delete `.git/hooks/pre-commit`.

`wi doctor` reports whether a pre-commit hook runs validation.
