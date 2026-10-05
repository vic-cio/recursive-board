import { Modal, Setting, setIcon, TFile, type App } from 'obsidian'
import { isWebAddress } from '../../shared/review.ts'

export interface ReviewRequestChoice {
  to: string
  /** What the reviewer should check. It may be blank. */
  note: string
  paths: string[]
  attachments: File[]
}

/**
 * Selects a reviewer, what to check, and what to review for one shared review request: files from
 * the system file picker, and web links or vault paths typed in. The picked files reach the vault
 * only on send.
 */
export class SendForReviewModal extends Modal {
  private readonly title: string
  private readonly names: string[]
  private readonly submit: (choice: ReviewRequestChoice) => void

  constructor(app: App, title: string, names: string[], submit: (choice: ReviewRequestChoice) => void) {
    super(app)
    this.title = title
    this.names = names
    this.submit = submit
  }

  override onOpen(): void {
    this.contentEl.empty()
    this.contentEl.addClass('wi-review-modal')
    this.setTitle('Send for review')
    this.contentEl.createDiv({ cls: 'wi-review-card', text: this.title })

    const names = [...this.names].sort((a, b) => a.localeCompare(b))
    let to = names[0] ?? ''
    new Setting(this.contentEl)
      .setName('Reviewer')
      .setDesc(names.length === 0 ? 'Add a note with type: person, then try again.' : '')
      .addDropdown((dropdown) => {
        for (const name of names) dropdown.addOption(name, name)
        if (names.length === 0) dropdown.addOption('', 'No person notes found').setDisabled(true)
        dropdown.setValue(to).onChange((value) => { to = value })
      })

    const note = this.contentEl.createEl('textarea', {
      cls: 'wi-review-note',
      attr: { 'aria-label': 'What to check', placeholder: 'What should the reviewer check? (optional)', rows: 3 },
    })

    const attachments: File[] = []
    const links: string[] = []
    const linkRow = this.contentEl.createDiv({ cls: 'wi-review-link-row' })
    const link = linkRow.createEl('input', {
      type: 'text', cls: 'wi-review-link',
      attr: { 'aria-label': 'Web link or vault path', placeholder: 'Add a link or vault path, then press Enter' },
    })
    const addLink = linkRow.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Add link' } })
    setIcon(addLink, 'plus')
    const attach = linkRow.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Attach files' } })
    setIcon(attach, 'paperclip')
    const picker = linkRow.createEl('input', { type: 'file', attr: { multiple: '', hidden: '' } })
    const problem = this.contentEl.createDiv({ cls: 'setting-item-description wi-review-problem' })
    const chips = this.contentEl.createDiv({ cls: 'wi-review-attachments' })

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
    picker.addEventListener('change', () => {
      attachments.push(...Array.from(picker.files ?? []))
      picker.value = '' // The same file can be picked again after a remove.
      drawChips()
    })
    attach.addEventListener('click', () => picker.click())

    /** Adds the typed link. False when the text is neither a web address nor a vault file. */
    const add = (): boolean => {
      const value = link.value.trim()
      if (value === '') return true
      if (!isWebAddress(value) && !(this.app.vault.getAbstractFileByPath(value) instanceof TFile)) {
        problem.setText(`"${value}" is not a web address that starts with http:// or https://, or a file in this vault.`)
        return false
      }
      problem.setText('')
      if (!links.includes(value)) links.push(value)
      link.value = ''
      drawChips()
      return true
    }
    addLink.addEventListener('click', () => {
      add()
      link.focus()
    })
    link.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      add()
    })

    const buttons = this.contentEl.createDiv({ cls: 'modal-button-container' })
    const send = buttons.createEl('button', { text: 'Send for review', cls: 'mod-cta' })
    send.disabled = names.length === 0
    buttons.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close())
    const submit = () => {
      // A link typed but not yet added goes with the request, or stops it with the reason.
      if (to === '' || !add()) return
      this.close()
      this.submit({ to, note: note.value.replace(/\s+/g, ' ').trim(), paths: links, attachments })
    }
    send.addEventListener('click', submit)
    note.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      submit()
    })
    note.focus()
  }

  override onClose(): void {
    this.contentEl.empty()
  }
}
