import { Modal, type App } from 'obsidian'

/** Selects a reviewer and optional vault-relative files for one shared review request. */
export class SendForReviewModal extends Modal {
  private readonly title: string
  private readonly names: string[]
  private readonly currentName: string
  private readonly submit: (to: string, files: string[]) => void

  constructor(app: App, title: string, names: string[], currentName: string, submit: (to: string, files: string[]) => void) {
    super(app)
    this.title = title
    this.names = names
    this.currentName = currentName
    this.submit = submit
  }

  override onOpen(): void {
    this.contentEl.empty()
    this.contentEl.createEl('h2', { text: 'Send for review' })
    this.contentEl.createDiv({ cls: 'setting-item-description', text: this.title })
    const reviewer = this.contentEl.createDiv({ cls: 'wi-review-field' })
    reviewer.createEl('label', { text: 'Reviewer' })
    const select = reviewer.createEl('select', { cls: 'dropdown', attr: { 'aria-label': 'Reviewer' } })
    const names = [...this.names].sort((a, b) => a.localeCompare(b))
    const current = names.find((name) => name.toLowerCase() === this.currentName.trim().toLowerCase())
    if (current) names.splice(names.indexOf(current), 1)
    if (current) names.unshift(current)
    for (const name of names) select.createEl('option', { text: name, value: name })
    if (current) select.value = current
    if (names.length === 0) {
      select.createEl('option', { text: 'No person notes found', value: '' })
      select.disabled = true
      reviewer.createDiv({ cls: 'setting-item-description', text: 'Add a note with type: person, then try again.' })
    }

    const field = this.contentEl.createDiv({ cls: 'wi-review-field' })
    field.createEl('label', { text: 'Files to review (optional, one path per line)' })
    const files = field.createEl('textarea', {
      cls: 'wi-review-files',
      attr: { 'aria-label': 'Files to review', rows: 4, placeholder: 'Work/quote.xlsx' },
    })
    const buttons = this.contentEl.createDiv({ cls: 'modal-button-container' })
    const send = buttons.createEl('button', { text: 'Send for review', cls: 'mod-cta' })
    send.disabled = names.length === 0
    buttons.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close())
    send.addEventListener('click', () => {
      const to = select.value
      if (to === '') return
      const paths = files.value.split(/\r?\n/).map((path) => path.trim()).filter((path) => path !== '')
      this.close()
      this.submit(to, paths)
    })
    select.focus()
  }

  override onClose(): void {
    this.contentEl.empty()
  }
}
