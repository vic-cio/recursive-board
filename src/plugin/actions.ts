/**
 * Every write the plugin makes.
 *
 * The rules live in `shared/transitions.ts`, so a card ticked here and a card moved by `wi` do
 * exactly the same thing. This module is only the Obsidian plumbing around them.
 *
 * `vault.process` is an atomic read-modify-write, and the edits inside it are line-wise, so a
 * toggle rewrites one line and copies every other byte. That keeps the diff to the requested field (docs/adr/0005-line-wise-frontmatter.md).
 *
 * An edit that depends on a current value, such as the status a `done` records or the list a
 * dependency joins, is computed inside `vault.process` from the text it hands over, never from
 * the metadata cache (docs/adr/0053-edits-from-the-file-at-write-time.md). The cache can be older
 * than the file. It still decides whether a click needs a write at all.
 */
import { normalizePath, Notice, TFile, type App } from 'obsidian'

import { applyStampedEdits, type EditPlan } from '../shared/edits.ts'
import { cardState } from '../shared/card-state.ts'
import { areaEdits, type AreaTarget } from '../shared/area.ts'
import { archiveEdits, activeDescendant } from '../shared/archive.ts'
import {
  boardEdits, moveEdits, moveRefusal, statusEdits, statusEditsIn, untickEditsIn, untickTarget,
} from '../shared/transitions.ts'
import { fileNameFor, newId, today, type Status } from '../shared/schema.ts'
import { inheritedChildFields, renderWorkItem } from '../shared/work-item.ts'
import { areaTagFor, type AreaNode } from '../shared/area-tags.ts'
import { dependencyEdit, dependencyEditIn, dependencyPathByKey } from '../shared/dependencies.ts'
import { parseFrontmatter } from '../shared/frontmatter.ts'
import { parseWikilink } from '../shared/schema.ts'
import { asName } from '../shared/authorship.ts'
import { applyVerdict, type Verdict } from '../shared/review.ts'
import type { WorkItemIndex, WorkItemMeta } from './index.ts'
import { UndoStack } from './undo.ts'

export class Actions {
  private readonly app: App
  private readonly index: WorkItemIndex
  /** Every board write, so it can be reversed. Session only (see `undo.ts`). */
  readonly undoStack = new UndoStack()

  /** The name in the "Your name" setting, which the add row writes as the creator. */
  private readonly you: () => string

  constructor(app: App, index: WorkItemIndex, you: () => string = () => '') {
    this.app = app
    this.index = index
    this.you = you
  }

  /** Applies a plan to the file's current text. Returns the text written, or null when nothing changed. */
  private async edit(file: TFile, plan: EditPlan, label: string): Promise<string | null> {
    let before = ''
    const after = await this.app.vault.process(file, (data) => {
      before = data
      return applyStampedEdits(data, plan)
    })
    if (after === before) return null
    this.undoStack.record({ kind: 'edit', path: file.path, before, after, label })
    return after
  }

  /**
   * Reverses the most recent board write, when its file is exactly as that write left it.
   * A file changed since is left alone and its entry dropped: undo never overwrites a later edit.
   */
  async undo(): Promise<void> {
    const entry = this.undoStack.pop()
    if (!entry) {
      new Notice('Nothing to undo.')
      return
    }
    const file = this.app.vault.getFileByPath(entry.path)
    if (!file) {
      new Notice(`Cannot undo ${entry.label}: ${entry.path} is gone.`)
      return
    }
    const done = await this.run(`undo ${entry.label}`, async () => {
      if (entry.kind === 'create') {
        const current = await this.app.vault.read(file)
        if (UndoStack.restore(entry, current) === null) {
          throw new Error('the file has changed since.')
        }
        await this.app.fileManager.trashFile(file)
      } else {
        await this.app.vault.process(file, (current) => {
          const restored = UndoStack.restore(entry, current)
          if (restored === null) throw new Error('the file has changed since.')
          return restored
        })
      }
      return true
    })
    if (done) new Notice(`Undid ${entry.label}`)
  }

  /** Moves a card between columns. One file, one write, never the parent. */
  async setStatus(meta: WorkItemMeta, to: Status): Promise<void> {
    if (statusEdits(meta.status, to, meta.prevStatus !== undefined) === null) return
    await this.writeStatus(meta, (text) => statusEditsIn(text, to), to)
  }

  /** The status write. `plan` reads the status and `prev_status` from the file's text. */
  private async writeStatus(meta: WorkItemMeta, plan: EditPlan, to: Status): Promise<void> {
    let written: string | null = null
    const done = await this.run(`move ${meta.title}`, async () => {
      written = await this.edit(meta.file, plan, `mark ${meta.title} ${to}`)
      return true
    })
    // wi refuses to start such a card. A person may, so the board only says so (docs/adr/0041-card-dependencies.md).
    if (done && written !== null && cardState(written).status === 'doing') {
      const waits = this.index.openDependencies(meta)
      if (waits.length > 0) new Notice(`${meta.title} still waits on ${waits.map((dependency) => dependency.title).join(', ')}.`)
      if (meta.blocked) new Notice(`${meta.title} is marked blocked.`)
    }
  }

  /**
   * Approve or send back a card that waits for your review (docs/adr/0043-review-verdicts.md).
   * The note and the frontmatter change are one write to the card. Returns true when it was written.
   */
  async review(meta: WorkItemMeta, verdict: Verdict): Promise<boolean> {
    const what = verdict.verdict === 'approve' ? `approve ${meta.title}` : `send back ${meta.title}`
    const done = await this.run(what, async () => {
      let before = ''
      const after = await this.app.vault.process(meta.file, (data) => {
        before = data
        return applyVerdict(data, verdict)
      })
      this.undoStack.record({ kind: 'edit', path: meta.file.path, before, after, label: what })
      return true
    })
    if (done) this.undoableNotice(verdict.verdict === 'approve' ? `Approved ${meta.title}` : `Sent back ${meta.title}`)
    return done === true
  }

  /** A card this one may wait on: not itself, not a root, and not one that already waits on it. */
  dependencyRefusal(meta: WorkItemMeta, target: WorkItemMeta): string | null {
    if (target.file === meta.file) return 'a card cannot wait on itself.'
    if (target.parentLink === null) return 'a root is never done.'
    // By path: the index makes new entries when it rebuilds, and `meta` may be an older one.
    const path = dependencyPathByKey(target, meta, (node) => node.file.path, (node) => node.dependsOn
      .map((file) => this.index.get(file))
      .filter((found): found is WorkItemMeta => found !== null))
    return path ? `${target.title} already waits on ${meta.title}.` : null
  }

  /** Adds or removes one entry in the waiting card's `depends_on`, the same edit as `wi depend`. */
  async setDependency(meta: WorkItemMeta, target: WorkItemMeta, on: boolean): Promise<void> {
    const refusal = on ? this.dependencyRefusal(meta, target) : null
    if (refusal !== null) {
      new Notice(`${meta.title} cannot wait on ${target.title}: ${refusal}`)
      return
    }
    const names = (link: string) => this.app.metadataCache.getFirstLinkpathDest(link, meta.file.path) === target.file
    if (dependencyEdit(meta.dependsOnRaw, target.stem, on, names) === null) return
    const label = on ? `${meta.title} waits on ${target.title}` : `${meta.title} no longer waits on ${target.title}`
    const what = on ? `make ${meta.title} wait on ${target.title}` : `stop ${meta.title} waiting on ${target.title}`
    // The list is the one in the file now, so an entry added since the cache was read survives.
    const written = await this.run(what, () => this.edit(meta.file, (text) => {
      const edit = dependencyEditIn(text, target.stem, on, names)
      return edit === null ? null : [edit]
    }, label))
    if (written) this.undoableNotice(label)
  }

  /** Ticking a checklist box. Unticking restores exactly what the item was. */
  async setDone(meta: WorkItemMeta, done: boolean): Promise<void> {
    if (done) return this.setStatus(meta, 'done')
    if (meta.status !== 'done') return
    // The target is the `prev_status` in the file now; the label names the one the cache holds.
    await this.writeStatus(meta, untickEditsIn, untickTarget(meta.prevStatus))
  }

  /** The promote toggle. Demotion deletes the key rather than writing `board: false`. */
  async setPromoted(meta: WorkItemMeta, promoted: boolean): Promise<void> {
    if (meta.board === promoted) return
    await this.run(
      promoted ? `promote ${meta.title}` : `demote ${meta.title}`,
      () => this.edit(meta.file, (text) => cardState(text).board === promoted ? null : boardEdits(promoted),
        `${promoted ? 'promote' : 'demote'} ${meta.title}`),
    )
  }

  /** Convert a child card and an area through the same tested rule as `wi area`. */
  async convertArea(meta: WorkItemMeta, target: AreaTarget): Promise<void> {
    const label = target.kind === 'area' ? 'make area' : 'make card'
    const done = await this.run(`${label} ${meta.title}`, async () => {
      // The refusal reads the agent in the file now, so a claim made since is never discarded.
      await this.edit(meta.file, (text) => {
        const now = cardState(text)
        return areaEdits({
          label: meta.file.path,
          isRoot: meta.parentLink === null,
          isArea: now.area,
          status: now.status,
          agent: now.agent,
        }, target)
      }, `${label} ${meta.title}`)
      return true
    })
    if (done) this.undoableNotice(`${target.kind === 'area' ? 'Made area' : 'Made card'} ${meta.title}`)
  }

  /** Archive one file. The index applies its flag to descendants when it reads them. */
  async setArchived(meta: WorkItemMeta, archived: boolean): Promise<void> {
    const target = archived ? meta : this.index.archiveOwner(meta) ?? meta
    const edits = archiveEdits(target.archived, archived)
    if (edits === null) return
    if (archived) {
      const active = activeDescendant(
        target,
        (item) => this.index.childrenOf(item.file),
        (item) => item.status,
      )
      if (active) {
        new Notice(`Cannot archive ${target.title}: descendant ${active.title} (${active.id ?? active.file.path}) is doing.`)
        return
      }
    }
    const verb = archived ? 'archive' : 'unarchive'
    await this.run(`${verb} ${target.title}`, () => this.edit(target.file,
      (text) => archiveEdits(cardState(text).archived, archived), `${verb} ${target.title}`))
  }

  /**
   * Why `meta` cannot move under `target`, or null when it can. The picker uses this to leave
   * out every target that would make the parent chain loop, so a refused move is never offered.
   */
  moveRefusal(meta: WorkItemMeta, target: WorkItemMeta): string | null {
    return moveRefusal({
      item: meta.file.path,
      target: target.file.path,
      isRoot: meta.parentLink === null,
      parentOf: (path) => {
        const file = this.app.vault.getFileByPath(path)
        return this.index.get(file)?.parent?.path ?? null
      },
    })
  }

  /**
   * Moving a card to another board. It rewrites the moved item's `parent` and nothing else, the
   * same rule `wi move` applies: the status stays, and the item's children follow it by link.
   */
  async move(meta: WorkItemMeta, target: WorkItemMeta): Promise<void> {
    const refusal = this.moveRefusal(meta, target)
    if (refusal !== null) {
      new Notice(`Cannot move ${meta.title} under ${target.title}: ${refusal}`)
      return
    }
    const current = meta.parent ? meta.parent.basename : meta.parentLink
    if (moveEdits(current, target.stem) === null) return
    // The loop check above reads the index. A move made at the same moment elsewhere is not seen.
    const written = await this.run(`move ${meta.title}`, () => this.edit(meta.file,
      (text) => moveEdits(parseWikilink(parseFrontmatter(text)?.get('parent')), target.stem), `move ${meta.title}`))
    if (written) this.undoableNotice(`Moved ${meta.title} to ${target.title}`)
  }

  /** The item, then each ancestor up to the root, for the area tag. A loop stops where it repeats. */
  private chainOf(start: WorkItemMeta): AreaNode[] {
    const chain: AreaNode[] = []
    const seen = new Set<string>()
    for (let item: WorkItemMeta | null = start; item && !seen.has(item.file.path); item = this.index.get(item.parent)) {
      seen.add(item.file.path)
      chain.push({ title: item.title, area: item.area })
    }
    return chain
  }

  /**
   * The add row at the foot of a column (docs/adr/0017-inline-status-capture.md).
   * Typing a title and pressing enter is one action, which is what makes a board a capture
   * surface rather than a report.
   */
  async createChild(parent: WorkItemMeta, rawTitle: string, status: Status): Promise<TFile | null> {
    const title = rawTitle.trim()
    if (title === '') return null

    const id = newId(this.index.takenIds())
    const stem = fileNameFor(title, id, this.index.takenStems())
    const path = normalizePath(`${this.index.config.workItemFolder}/${stem}.md`)

    if (this.app.vault.getAbstractFileByPath(path)) {
      new Notice(`${path} already exists. Nothing was written.`)
      return null
    }

    const stamp = today()
    const areaTag = this.index.config.areaTags ? areaTagFor([{ title, area: false }, ...this.chainOf(parent)]) : null
    const text = renderWorkItem({
      id,
      title,
      status,
      parentStem: parent.stem,
      ...inheritedChildFields(parent, status),
      ...(areaTag === null ? {} : { tags: [areaTag] }),
      // A person typed this card on the board (docs/adr/0042-creator-and-role.md).
      ...(this.you().trim() === '' ? {} : { creator: asName(this.you()) }),
      created: stamp,
      updated: stamp,
    }, this.index.config.extraSections)

    const created = await this.run(`create ${title}`, () => this.app.vault.create(path, text))
    if (created) this.undoStack.record({ kind: 'create', path, before: '', after: text, label: `add ${title}` })
    return created
  }

  /**
   * Removing a work item, which is the missing inverse of the add row.
   *
   * It refuses when the item has children. Deleting a parent does not delete its children: it
   * leaves them pointing at a file that no longer exists, which integrity rule 4 forbids
   * repairing silently, and an unresolved parent leaves the child invisible on every board. Refusing is the only
   * answer that does not quietly lose work.
   *
   * The confirmation is Obsidian's own, so it honours the vault's "Deleted files" setting: a
   * deletion goes to the system trash, to `.trash`, or is permanent. The plugin does not get to
   * decide how recoverable this is.
   *
   * Returns true when the file was removed.
   */
  async remove(meta: WorkItemMeta): Promise<boolean> {
    const children = this.index.childrenOf(meta.file)
    if (children.length > 0) {
      const names = children.slice(0, 3).map((c) => c.title).join(', ')
      const more = children.length > 3 ? `, and ${children.length - 3} more` : ''
      new Notice(
        `${meta.title} has ${children.length} children: ${names}${more}. ` +
        'Move or delete them first, or they would appear on no board.',
        8000,
      )
      return false
    }
    return (await this.app.fileManager.promptForDeletion(meta.file)) ?? false
  }

  /** Opens a work item, which is how a card is navigated into. */
  async open(meta: WorkItemMeta, newLeaf = false): Promise<void> {
    await this.app.workspace.getLeaf(newLeaf).openFile(meta.file)
  }

  /**
   * A notice with an Undo button. Used for a move, which sends the card off the screen you are
   * looking at, so it is the write most in need of a visible way back, and the phone has no hotkey.
   */
  private undoableNotice(message: string): void {
    const fragment = createFragment((f) => {
      f.createSpan({ text: `${message}. ` })
      const link = f.createEl('a', { text: 'Undo', href: '#' })
      link.addEventListener('click', (event) => {
        event.preventDefault()
        notice.hide()
        void this.undo()
      })
    })
    const notice = new Notice(fragment, 6000)
  }

  private async run<T>(what: string, fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn()
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      new Notice(`Recursive Board could not ${what}: ${reason}`)
      return null
    }
  }
}
