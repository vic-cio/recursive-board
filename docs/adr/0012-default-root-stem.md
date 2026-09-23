---
status: proposed
---
# Configure the default root by filename stem

`.wi.json` currently accepts `defaultRoot` only when it is a work item filename stem. `wi new` uses it when `--parent` is omitted, and generated templates use it for their parent link. A missing value leaves the parent explicit.

The open decision is whether the filename stem is the right configuration value.
