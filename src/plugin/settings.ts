import { PluginSettingTab, Setting, type App, type Plugin } from 'obsidian'

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

  constructor(
    app: App,
    plugin: Plugin,
    colors: () => StatusColors,
    changeColor: (key: StatusColorKey, color: string | undefined) => Promise<void>,
    maxAgents: () => number | null,
    changeMaxAgents: (maxAgents: number | null) => Promise<void>,
  ) {
    super(app, plugin)
    this.colors = colors
    this.changeColor = changeColor
    this.maxAgents = maxAgents
    this.changeMaxAgents = changeMaxAgents
  }

  override display(): void {
    const { containerEl } = this
    containerEl.empty()
    containerEl.createEl('h2', { text: 'Recursive Board' })
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
      .setDesc('Maximum claimed cards in doing for this vault. Dispatchers read this with wi agents. WI_MAX_AGENTS overrides it for one run.')
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
}
