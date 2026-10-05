import { AbstractInputSuggest, PluginSettingTab, Setting, TFolder, type App, type Plugin } from 'obsidian'
import type { VaultConfig } from '../shared/vault-config.ts'
import { cleanSections } from '../shared/board-settings.ts'

/** What the Board section reads and writes (docs/adr/0050-board-settings-in-plugin-data.md). */
export interface BoardSettingsHost {
  config: () => VaultConfig
  update: (patch: Partial<VaultConfig>) => Promise<void>
  /** Renames the card folder to this path, or points at it when a folder there exists. */
  renameFolder: (path: string) => Promise<void>
  /** Filename stems and titles of the cards that can be the default root. */
  roots: () => Array<{ stem: string; title: string }>
}

class FolderSuggest extends AbstractInputSuggest<TFolder> {
  private readonly input: HTMLInputElement
  private readonly choose: (path: string) => void

  constructor(app: App, input: HTMLInputElement, choose: (path: string) => void) {
    super(app, input)
    this.input = input
    this.choose = choose
  }

  protected getSuggestions(query: string): TFolder[] {
    const lower = query.toLowerCase()
    return this.app.vault.getAllLoadedFiles()
      .filter((file): file is TFolder => file instanceof TFolder && !file.isRoot() && file.path.toLowerCase().includes(lower))
      .sort((a, b) => a.path.localeCompare(b.path))
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.path)
  }

  override selectSuggestion(folder: TFolder): void {
    this.input.value = folder.path
    this.choose(folder.path)
    this.close()
  }
}

export const STATUS_COLOR_KEYS = ['options', 'doing', 'done', 'agent'] as const
export type StatusColorKey = typeof STATUS_COLOR_KEYS[number]
export type StatusColors = Partial<Record<StatusColorKey, string>>

const COLOR_SETTINGS: ReadonlyArray<{
  key: StatusColorKey
  name: string
  description: string
  themeVariable: string
  fallback: string
}> = [
  { key: 'options', name: 'Options', description: 'Colour for options status.', themeVariable: '--color-yellow-rgb', fallback: '#e0ac00' },
  { key: 'doing', name: 'Doing', description: 'Colour for doing status.', themeVariable: '--color-blue-rgb', fallback: '#086ddd' },
  { key: 'done', name: 'Done', description: 'Colour for done status.', themeVariable: '--color-green-rgb', fallback: '#08b94e' },
  { key: 'agent', name: 'Agent badge', description: 'Colour for agent badges.', themeVariable: '--color-purple-rgb', fallback: '#a882ff' },
]

export function parseStatusColors(value: unknown): StatusColors {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}

  const colors: StatusColors = {}
  for (const key of STATUS_COLOR_KEYS) {
    const color: unknown = Reflect.get(value, key)
    if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) colors[key] = color
  }
  return colors
}

function themeColor(setting: typeof COLOR_SETTINGS[number]): string {
  const channels = getComputedStyle(document.body).getPropertyValue(setting.themeVariable)
    .split(',')
    .map((channel) => Number(channel.trim()))
  if (channels.length !== 3 || channels.some((channel) => !Number.isFinite(channel))) return setting.fallback
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`
}

export class StatusColorSettingTab extends PluginSettingTab {
  private readonly colors: () => StatusColors
  private readonly changeColor: (key: StatusColorKey, color: string | undefined) => Promise<void>
  private readonly maxAgents: () => number | null
  private readonly changeMaxAgents: (maxAgents: number | null) => Promise<void>
  private readonly board: BoardSettingsHost

  constructor(
    app: App,
    plugin: Plugin,
    colors: () => StatusColors,
    changeColor: (key: StatusColorKey, color: string | undefined) => Promise<void>,
    maxAgents: () => number | null,
    changeMaxAgents: (maxAgents: number | null) => Promise<void>,
    board: BoardSettingsHost,
  ) {
    super(app, plugin)
    this.colors = colors
    this.changeColor = changeColor
    this.maxAgents = maxAgents
    this.changeMaxAgents = changeMaxAgents
    this.board = board
  }

  override display(): void {
    const { containerEl } = this
    containerEl.empty()
    containerEl.createEl('h2', { text: 'Recursive Board' })
    this.displayBoard(containerEl)
    containerEl.createEl('h3', { text: 'Status colours' })

    for (const colorSetting of COLOR_SETTINGS) {
      new Setting(containerEl)
        .setName(colorSetting.name)
        .setDesc(colorSetting.description)
        .addColorPicker((picker) => {
          picker
            .setValue(this.colors()[colorSetting.key] ?? themeColor(colorSetting))
            .onChange((color) => this.changeColor(colorSetting.key, color))
        })
        .addButton((button) => button
          .setButtonText('Reset')
          .setTooltip('Use the current theme colour')
          .onClick(() => {
            void this.changeColor(colorSetting.key, undefined)
            this.display()
          }))
    }

    containerEl.createEl('h3', { text: 'Dispatcher' })
    new Setting(containerEl)
      .setName('Concurrent agent limit')
      .setDesc('Maximum agents with a claimed card in doing for this vault. Dispatchers read it with wi agents. WI_MAX_AGENTS overrides it for one run.')
      .addText((text) => {
        text.inputEl.type = 'number'
        text.inputEl.min = '0'
        text.inputEl.step = '1'
        text.setPlaceholder('No limit')
          .setValue(this.maxAgents()?.toString() ?? '')
          .onChange((value) => {
            if (value === '') {
              void this.changeMaxAgents(null)
              return
            }
            const parsed = Number(value)
            if (Number.isSafeInteger(parsed) && parsed >= 0) void this.changeMaxAgents(parsed)
          })
      })
  }

  /** Board settings shape every card, so they come first. wi reads them from the plugin data. */
  private displayBoard(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Board' })
    const config = this.board.config()

    let folderValue = config.workItemFolder
    new Setting(containerEl)
      .setName('Card folder')
      .setDesc('The folder that holds every card. Rename moves the folder with all its cards in one step, and links keep working. If a folder with the new name exists, the board reads that folder instead.')
      .addText((text) => {
        text.setPlaceholder('Boards').setValue(folderValue)
          .onChange((value) => { folderValue = value })
        new FolderSuggest(this.app, text.inputEl, (path) => { folderValue = path })
      })
      .addButton((button) => button
        .setButtonText('Rename')
        .onClick(async () => {
          const folder = folderValue.trim().replace(/\/+$/, '')
          if (folder === '' || folder === this.board.config().workItemFolder) return
          await this.board.renameFolder(folder)
          this.display()
        }))

    new Setting(containerEl)
      .setName('Default parent')
      .setDesc('The card that wi new puts a new card under when you give no --parent. It is a card, such as Main, not a folder.')
      .addDropdown((dropdown) => {
        dropdown.addOption('', 'None')
        const roots = this.board.roots()
        for (const root of roots) dropdown.addOption(root.stem, root.title)
        if (config.defaultRoot !== null && !roots.some((root) => root.stem === config.defaultRoot)) {
          dropdown.addOption(config.defaultRoot, `${config.defaultRoot} (not found)`)
        }
        dropdown.setValue(config.defaultRoot ?? '')
          .onChange((value) => void this.board.update({ defaultRoot: value === '' ? null : value }))
      })

    this.displaySections(containerEl, config)

    new Setting(containerEl)
      .setName('Promote parent on first child')
      .setDesc('The first child turns a card into a board in wi new and the board add row.')
      .addToggle((toggle) => toggle
        .setValue(config.autoPromote)
        .onChange((value) => void this.board.update({ autoPromote: value })))
  }

  /** One chip per heading, so no one has to follow a separator rule. A heading is added or removed, never edited. */
  private displaySections(containerEl: HTMLElement, config: VaultConfig): void {
    const sections = config.extraSections
    let draft = ''
    const add = () => {
      const next = cleanSections([...sections, draft])
      if (next.length === sections.length) return
      void this.board.update({ extraSections: next }).then(() => this.display())
    }

    const setting = new Setting(containerEl)
      .setName('Extra sections')
      .setDesc('Every card has Objective, Context, Acceptance Criteria and Notes. These headings follow them on every new card.')
      .addText((text) => {
        text.setPlaceholder('Heading').onChange((value) => { draft = value })
        text.inputEl.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            add()
          }
        })
      })
      .addButton((button) => button.setButtonText('Add').onClick(add))

    const chips = setting.descEl.createDiv({ cls: 'wi-section-chips' })
    for (const heading of sections) {
      const chip = chips.createSpan({ cls: 'wi-section-chip', text: heading })
      const remove = chip.createEl('button', { cls: 'wi-section-chip-remove', text: '×', attr: { 'aria-label': `Remove ${heading}` } })
      remove.addEventListener('click', () => {
        void this.board.update({ extraSections: sections.filter((section) => section !== heading) }).then(() => this.display())
      })
    }
  }
}
