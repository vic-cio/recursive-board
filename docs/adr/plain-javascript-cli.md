---
status: accepted
---
# Ship the CLI as bundled JavaScript

The `wi` source is TypeScript, but the build emits one executable ESM JavaScript file for Node. Users can run the CLI without installing a TypeScript toolchain. Node built-ins remain external imports.
