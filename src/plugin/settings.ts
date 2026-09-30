import { AbstractInputSuggest, PluginSettingTab, Setting, TFolder, type App, type Plugin } from 'obsidian'
import type { WebReviewMode } from './dashboard-model.ts'
import type { VaultConfig } from '../shared/vault-config.ts'

/** What the Board section reads and writes (docs/adr/0050-board-settings-in-plugin-data.md). */
export interface BoardSettingsHost {
  config: () => VaultConfig
  update: (patch: Partial<VaultConfig>) => Promise<void>
  /** Filename stems and titles of the cards that can be the default root. */
  roots: () => Array<{ stem: string; title: string }>
}

/** Parses the Extra sections field: one heading per line, blank lines dropped. */
export function parseExtraSections(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '')
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

export const STATUS_COLOR_KEYS = ['options', 'doing', 'done', 'blocked', 'agent'] as const
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
  { key: 'blocked', name: 'Blocked', description: 'Colour for blocked work.', themeVariable: '--color-red-rgb', fallback: '#e93147' },
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
  private readonly you: () => string
  private readonly changeYou: (you: string) => Promise<void>
  private readonly webReviewMode: () => WebReviewMode
  private readonly changeWebReviewMode: (mode: WebReviewMode) => Promise<void>
  private readonly personNames: () => string[]
  private readonly board: BoardSettingsHost

  constructor(
    app: App,
    plugin: Plugin,
    colors: () => StatusColors,
    changeColor: (key: StatusColorKey, color: string | undefined) => Promise<void>,
    maxAgents: () => number | null,
    changeMaxAgents: (maxAgents: number | null) => Promise<void>,
    you: () => string,
    changeYou: (you: string) => Promise<void>,
    webReviewMode: () => WebReviewMode,
    changeWebReviewMode: (mode: WebReviewMode) => Promise<void>,
    personNames: () => string[],
    board: BoardSettingsHost,
  ) {
    super(app, plugin)
    this.colors = colors
    this.changeColor = changeColor
    this.maxAgents = maxAgents
    this.changeMaxAgents = changeMaxAgents
    this.you = you
    this.changeYou = changeYou
    this.webReviewMode = webReviewMode
    this.changeWebReviewMode = changeWebReviewMode
    this.personNames = personNames
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
      .setDesc('Maximum agents with a claimed card in doing for this vault. Dispatchers read this with wi agents. WI_MAX_AGENTS overrides it for one run.')
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

    containerEl.createEl('h3', { text: 'Dashboard' })
    new Setting(containerEl)
      .setName('Your name')
      .setDesc('The owner name on cards that wait for your review. The dashboard lists a card in doing with this owner and no open child.')
      .addText((text) => {
        const list = containerEl.createEl('datalist')
        list.id = 'recursive-board-person-names'
        for (const name of this.personNames()) list.createEl('option', { attr: { value: name } })
        text.inputEl.setAttribute('list', list.id)
        text.setPlaceholder('Name')
          .setValue(this.you())
          .onChange((value) => void this.changeYou(value.trim()))
      })
    new Setting(containerEl)
      .setName('Web pages in For review')
      .addDropdown((dropdown) => dropdown
        .addOption('webviewer', 'Open in a Web viewer tab')
        .addOption('browser', 'Open in the browser')
        .addOption('off', 'Off')
        .setValue(this.webReviewMode())
        .onChange((value) => {
          if (value === 'webviewer' || value === 'browser' || value === 'off') {
            void this.changeWebReviewMode(value)
          }
        }))
  }

  /** Board settings shape every card, so they come first. wi reads them from the plugin data. */
  private displayBoard(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Board' })
    const config = this.board.config()

    new Setting(containerEl)
      .setName('Card folder')
      .setDesc('The folder that holds every card. A change only points the board at another folder: it does not move cards. Move the folder first, then change this.')
      .addText((text) => {
        const commit = (value: string) => {
          const folder = value.trim().replace(/\/+$/, '')
          if (folder !== '' && folder !== this.board.config().workItemFolder) void this.board.update({ workItemFolder: folder })
        }
        text.setPlaceholder('Boards').setValue(config.workItemFolder)
        text.inputEl.addEventListener('blur', () => commit(text.getValue()))
        new FolderSuggest(this.app, text.inputEl, commit)
      })

    new Setting(containerEl)
      .setName('Default root')
      .setDesc('The card that wi new uses as the parent when you give none.')
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

    new Setting(containerEl)
      .setName('Extra sections')
      .setDesc('Headings added to every new card, one per line.')
      .addTextArea((area) => {
        area.setPlaceholder('Knowledge').setValue(config.extraSections.join('\n'))
        area.inputEl.rows = 3
        area.inputEl.addEventListener('blur', () => {
          const sections = parseExtraSections(area.getValue())
          if (sections.join('\n') !== this.board.config().extraSections.join('\n')) void this.board.update({ extraSections: sections })
        })
      })

    new Setting(containerEl)
      .setName('Promote parent on first child')
      .setDesc('wi new turns a card into a board when it gives the card its first child.')
      .addToggle((toggle) => toggle
        .setValue(config.autoPromote)
        .onChange((value) => void this.board.update({ autoPromote: value })))

    new Setting(containerEl)
      .setName('Area tags')
      .setDesc('Cards carry an area/... tag for their areas, which the graph view colours.')
      .addToggle((toggle) => toggle
        .setValue(config.areaTags)
        .onChange((value) => void this.board.update({ areaTags: value })))
  }
}
