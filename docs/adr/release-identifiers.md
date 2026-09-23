---
status: accepted
---
# The release uses the Recursive Board identifiers

The release decision assigns `recursive-board` as both the Obsidian plugin id and npm package name. The CLI binary is `wi`. These names give the plugin a community-directory-compatible id and keep the installable package name aligned with the product.

The source has not caught up with this decision: the manifest still uses `obsidian-recursive-board`, and `package.json` still names the private package `recursive-board`. The release identifiers must be applied before publication.
