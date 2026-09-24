import { Notice, normalizePath, TFile, type App } from 'obsidian'

import { firstBoardNameStem, firstBoardPlan } from '../shared/first-board.ts'
import { parseVaultConfig, WI_CONFIG_FILE } from '../shared/vault-config.ts'
import type { WorkItemIndex } from './index.ts'

export async function createFirstBoard(app: App, index: WorkItemIndex, rawTitle: string): Promise<void> {
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

  const adapter = app.vault.adapter
  const configFile = app.vault.getFileByPath(WI_CONFIG_FILE)
  const configExists = await adapter.exists(WI_CONFIG_FILE)
  const configText = configFile instanceof TFile
    ? await app.vault.read(configFile)
    : configExists ? await adapter.read(WI_CONFIG_FILE) : null

  // Parse before any writes, so a bad existing setting cannot leave a half-created board.
  let config
  try {
    config = parseVaultConfig(configText)
  } catch (error) {
    new Notice(error instanceof Error ? error.message : String(error))
    return
  }

  const plan = firstBoardPlan({
    title,
    configText,
    takenIds: index.takenIds(),
    takenStems: index.takenStems(),
    extraSections: config.extraSections,
  })
  const folder = normalizePath(index.config.workItemFolder)
  const paths = plan.files.map((file) => normalizePath(`${folder}/${file.path}`))
  if (paths.some((path) => app.vault.getAbstractFileByPath(path) !== null)) {
    new Notice(`A file already uses the name “${requestedStem}”. Nothing was written.`)
    return
  }
  if (configExists && !configFile) {
    new Notice(`${WI_CONFIG_FILE} exists but is not a Markdown file. Nothing was written.`)
    return
  }

  try {
    await ensureFolder(app, folder)
    for (let i = 0; i < plan.files.length; i++) {
      await app.vault.create(paths[i]!, plan.files[i]!.text)
    }
    if (configFile instanceof TFile) await app.vault.modify(configFile, plan.configText)
    else await app.vault.create(WI_CONFIG_FILE, plan.configText)

    const rootFile = app.vault.getFileByPath(paths[0]!)
    if (!rootFile) throw new Error('The new board file could not be opened.')
    index.invalidate()
    await app.workspace.getLeaf(false).openFile(rootFile)
    new Notice(`Created “${title}”. Add cards from the board columns.`)
  } catch (error) {
    new Notice(`Could not create the board: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function ensureFolder(app: App, path: string): Promise<void> {
  const parts = path.split('/')
  let current = ''
  for (const part of parts) {
    current = current === '' ? part : `${current}/${part}`
    if (!(await app.vault.adapter.exists(current))) await app.vault.createFolder(current)
  }
}
