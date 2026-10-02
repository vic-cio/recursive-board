import { Modal, setIcon, TFile, type App } from 'obsidian'
import { isWebAddress } from '../../shared/dashboard.ts'

/**
 * Selects a reviewer and what to review for one shared review request: files from the system file
 * picker, and web links or vault paths typed in. The picked files reach the vault only on send.
 */
export class SendForReviewModal extends Modal {
  private readonly title: string
  private readonly names: string[]
  private readonly currentName: string
  private readonly submit: (to: string, paths: string[], attachments: File[]) => void

  constructor(
    app: App, title: string, names: string[], currentName: string,
    submit: (to: string, paths: string[], attachments: File[]) => void,
  ) {
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

    const attachments: File[] = []
    const links: string[] = []
    const field = this.contentEl.createDiv({ cls: 'wi-review-field' })
    field.createEl('label', { text: 'What to review (optional)' })
    const chips = field.createDiv({ cls: 'wi-review-attachments' })
    const chip = (icon: string, text: string, remove: () => void) => {
      const box = chips.createDiv({ cls: 'wi-review-attachment' })
      setIcon(box.createSpan({ cls: 'wi-review-attach-icon' }), icon)
      box.createSpan({ text })
      const button = box.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': `Remove ${text}` } })
      setIcon(button, 'x')
      button.addEventListener('click', () => {
        remove()
        drawChips()
      })
    }
    const drawChips = () => {
      chips.empty()
      attachments.forEach((file, index) => chip('paperclip', file.name, () => attachments.splice(index, 1)))
      links.forEach((link, index) => chip(isWebAddress(link) ? 'globe-2' : 'file-text', link, () => links.splice(index, 1)))
    }
    const picker = field.createEl('input', { type: 'file', attr: { multiple: '', hidden: '' } })
    picker.addEventListener('change', () => {
      attachments.push(...Array.from(picker.files ?? []))
      picker.value = '' // The same file can be picked again after a remove.
      drawChips()
    })
    const attach = field.createEl('button', { text: 'Attach files…' })
    attach.addEventListener('click', () => picker.click())

    const linkRow = field.createDiv({ cls: 'wi-review-link-row' })
    const link = linkRow.createEl('input', {
      type: 'text', cls: 'wi-review-link',
      attr: { 'aria-label': 'Web link or vault path', placeholder: 'https://example.com or Work/quote.xlsx' },
    })
    const addLink = linkRow.createEl('button', { text: 'Add link' })
    const problem = field.createDiv({ cls: 'setting-item-description' })
    const add = () => {
      const value = link.value.trim()
      if (value === '') return
      if (!isWebAddress(value) && !(this.app.vault.getAbstractFileByPath(value) instanceof TFile)) {
        problem.setText(`"${value}" is not a web address that starts with http:// or https://, or a file in this vault.`)
        return
      }
      problem.setText('')
      if (!links.includes(value)) links.push(value)
      link.value = ''
      drawChips()
      link.focus()
    }
    addLink.addEventListener('click', add)
    link.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      add()
    })
    const buttons = this.contentEl.createDiv({ cls: 'modal-button-container' })
    const send = buttons.createEl('button', { text: 'Send for review', cls: 'mod-cta' })
    send.disabled = names.length === 0
    buttons.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close())
    send.addEventListener('click', () => {
      const to = select.value
      if (to === '') return
      this.close()
      this.submit(to, links, attachments)
    })
    select.focus()
  }

  override onClose(): void {
    this.contentEl.empty()
  }
}
