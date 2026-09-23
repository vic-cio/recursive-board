/**
 * The Home dashboard section.
 *
 * Decision u8 closes a hole: a work item whose `parent` does not resolve appears on no board
 * anywhere. It is not lost, it is never shown, and that can happen from a rename, a deleted
 * parent, a sync conflict or an agent writing a bad link. `wi validate` catches it at commit
 * time, which is the right place to catch it and the wrong place to notice it.
 *
 * Known risk, from the UI doc: Home only helps if you open it.
 */
import { setIcon, type TFile } from 'obsidian'

import type { WorkItemMeta } from '../index.ts'
import type { RenderContext } from './context.ts'

export function renderHome(host: HTMLElement, ctx: RenderContext): void {
  const orphans = ctx.index.orphans()
  const blocked = ctx.index.blocked()
  const unstatused = ctx.index.invalidStatus()
  const intake = ctx.index.unprocessedIntake()

  const panel = host.createDiv({ cls: 'wi-home' })
  panel.createDiv({ cls: 'wi-home-heading', text: 'Needs attention' })

  if (orphans.length + blocked.length + unstatused.length + intake.length === 0) {
    panel.createDiv({
      cls: 'wi-empty',
      text: 'Nothing is orphaned, blocked, missing a status or waiting in Intake.',
    })
    return
  }

  renderGroup(panel, ctx, 'unlink', 'Orphans', orphans,
    (m) => `parent [[${m.parentLink}]] does not resolve`)
  renderGroup(panel, ctx, 'octagon-alert', 'Blocked', blocked,
    (m) => m.status ?? '')
  renderGroup(panel, ctx, 'help-circle', 'No status', unstatused,
    () => 'a non-root work item needs one of the four statuses')
  renderIntake(panel, ctx, intake)
}

/** Unprocessed capture. Filenames only: a note in `Intake/` is raw material, never work state. */
function renderIntake(panel: HTMLElement, ctx: RenderContext, files: TFile[]): void {
  if (files.length === 0) return
  const group = panel.createDiv({ cls: 'wi-home-group' })
  const heading = group.createDiv({ cls: 'wi-home-group-heading' })
  setIcon(heading.createSpan({ cls: 'wi-home-icon' }), 'inbox')
  heading.createSpan({ text: `Intake (${files.length})` })

  const list = group.createEl('ul', { cls: 'wi-home-list' })
  for (const file of files) {
    const row = list.createEl('li')
    const link = row.createSpan({ cls: 'wi-home-link', text: file.basename })
    link.addEventListener('click', (event) => {
      event.preventDefault()
      void ctx.app.workspace.getLeaf(event.metaKey || event.ctrlKey).openFile(file)
    })
  }
}

function renderGroup(
  panel: HTMLElement,
  ctx: RenderContext,
  icon: string,
  title: string,
  items: WorkItemMeta[],
  note: (meta: WorkItemMeta) => string,
): void {
  if (items.length === 0) return
  const group = panel.createDiv({ cls: 'wi-home-group' })
  const heading = group.createDiv({ cls: 'wi-home-group-heading' })
  setIcon(heading.createSpan({ cls: 'wi-home-icon' }), icon)
  heading.createSpan({ text: `${title} (${items.length})` })

  const list = group.createEl('ul', { cls: 'wi-home-list' })
  for (const meta of items) {
    const row = list.createEl('li')
    const link = row.createSpan({ cls: 'wi-home-link', text: meta.title })
    link.addEventListener('click', (event) => {
      event.preventDefault()
      void ctx.actions.open(meta, event.metaKey || event.ctrlKey)
    })
    const text = note(meta)
    if (text) row.createSpan({ cls: 'wi-home-note', text })
  }
}
