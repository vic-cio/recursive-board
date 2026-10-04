import { Notice, normalizePath, type App } from 'obsidian'

import { firstBoardNameStem, firstBoardPlan } from '../shared/first-board.ts'
import type { WorkItemIndex } from './index.ts'
import { AgentSetupModal } from './ui/agent-setup-modal.ts'

/** Creates the board files, then sets the new board as the default root in the board settings. */
export async function createFirstBoard(
  app: App,
  index: WorkItemIndex,
  rawTitle: string,
  setDefaultRoot: (stem: string) => Promise<void>,
): Promise<void> {
  const title = rawTitle.trim()
  if (title === '') {
    new Notice('Enter a name for the board.')
    return
  }

  const requestedStem = firstBoardNameStem(title)
  const existingRoot = index.all().find((item) =>
    item.parentLink === null && item.stem.toLowerCase() === requestedStem.toLowerCase())
  if (existingRoot) {
    new Notice(`A root named “${existingRoot.title}” already exists. Choose another board name.`)
    return
  }

  const plan = firstBoardPlan({
    title,
    takenIds: index.takenIds(),
    takenStems: index.takenStems(),
    extraSections: index.config.extraSections,
  })
  const folder = normalizePath(index.config.workItemFolder)
  const paths = plan.files.map((file) => normalizePath(`${folder}/${file.path}`))
  if (paths.some((path) => app.vault.getAbstractFileByPath(path) !== null)) {
    new Notice(`A file already uses the name “${requestedStem}”. Nothing was written.`)
    return
  }

  try {
    await ensureFolder(app, folder)
    for (let i = 0; i < plan.files.length; i++) {
      await app.vault.create(paths[i]!, plan.files[i]!.text)
    }
    await setDefaultRoot(plan.rootStem)

    const rootFile = app.vault.getFileByPath(paths[0]!)
    if (!rootFile) throw new Error('The new board file could not be opened.')
    index.invalidate()
    await app.workspace.getLeaf(false).openFile(rootFile)
    createdNotice(app, title)
  } catch (error) {
    new Notice(`Could not create the board: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Names the next step, and offers the optional agent setup without opening it. */
function createdNotice(app: App, title: string): void {
  const notice = new Notice(createFragment((el) => {
    el.createSpan({ text: `Created “${title}”. Add cards from the board columns. ` })
    const link = el.createEl('a', { text: 'Recommended agent setup (optional)' })
    link.addEventListener('click', (event) => {
      event.preventDefault()
      notice.hide()
      new AgentSetupModal(app).open()
    })
  }), 15_000)
}

async function ensureFolder(app: App, path: string): Promise<void> {
  const parts = path.split('/')
  let current = ''
  for (const part of parts) {
    current = current === '' ? part : `${current}/${part}`
    if (!(await app.vault.adapter.exists(current))) await app.vault.createFolder(current)
  }
}
