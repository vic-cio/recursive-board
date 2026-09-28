---
status: accepted
---
# Colour the graph by area

With `"areaTags": true` in the vault config, every work item under an area carries one nested tag that
names its areas from the top down: `area/work/web-site`. An area carries its own path. A root, and
an item in no area, carries none. The setting is off by default, because it adds a tag to almost
every card in a vault that has areas.

`wi graph` writes two colour groups per area into `.obsidian/graph.json`, before the owner's own
groups, which it keeps. The graph uses the first group that matches, and `tag:#area/work` also
matches `area/work/web-site`, so:

- Deeper areas come first. A sub-area is a lighter shade of its top area's hue, so a family reads
  as one colour.
- Within an area, boards and areas (`[board:true] OR [area:true]`) come first, in a darker shade.
- The hue is the label colour of the top area's tag (0018), mapped to Obsidian's default RGB for
  that colour. Nothing is stored.

The graph gives a group one solid colour, so these shades are the only gradient it can show. A
shade per depth would put the depth into every tag, and every move would make it stale.

## Who writes the tag

`wi new` and the plugin's add row write it. `wi move` and `wi area` still write one file each, so
the tags below them go stale. `wi validate` warns (`area-tag-stale`), those two commands say how
many are stale, and `wi retag` rewrites each stale item as its own one-file edit. The tag is
derived from the tree, so `wi retag` only ever makes it match the tree.

The board hides `area/` label chips. The board already shows where a card sits.

## Considered options

A settings pane that maps each label to a colour grows with every project and needs a sync story.
Properties cannot express "under this area", and Obsidian's search has no ancestor query, so a
tag on each item is the only thing the graph can match.
