---
status: accepted
---
# Append notes through `wi note`, under a lock

`wi note <ref> <text>` appends `- <date> <time>, <agent>: <text>` under the card's Notes. The agent
is `--agent`, else the card's `agent`. The time is local, so two lines on one day stay in order.

Every `wi` write to an existing card now takes a per-file lock and re-reads the file before it
applies its edits. The lock is in the OS temp folder, because a lock file in the work-item folder
would trip the unaccounted-file guard (0008). A lock older than 30 seconds is stale and is taken
over. [0054](0054-edits-from-the-file-at-write-time.md) makes the lock a file with a token, makes the
takeover atomic, and computes each edit from the text read under the lock.

A dispatcher and its worker wrote to one card with read-modify-write file edits, and one write
could lose the other. The lock serialises `wi` processes on one machine. It cannot hold off a sync
client or an editor; the re-read keeps their earlier changes, since edits name keys and a note
appends.
