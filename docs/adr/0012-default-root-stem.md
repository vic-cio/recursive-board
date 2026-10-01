---
status: accepted
---
# Configure the default root by filename stem

The vault config accepts `defaultRoot` as the filename stem of a root work item. The value stays a stem because a person reads and types it, and it becomes the parent link when `wi new` creates an item. `wi new` uses it when `--parent` is omitted. A missing value leaves the parent explicit. `wi validate` warns when the configured stem names no root. Template bodies stay in code and do not render vault files. [ADR 0048](0048-synced-vault-config-note.md) defines the config source.
