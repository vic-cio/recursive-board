---
status: accepted
---
# Configure the default root by filename stem

`.wi.json` accepts `defaultRoot` as the filename stem of a root work item. The value stays a stem because a person reads and types it, and it becomes the parent link in generated templates. `wi new` uses it when `--parent` is omitted. A missing value leaves the parent explicit. `wi validate` warns when the configured stem names no root.
