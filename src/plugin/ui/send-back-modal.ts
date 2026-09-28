import { Modal, type App } from 'obsidian'

/** Asks for the comment a send back writes to the card's Notes. A note is one line. */
export class SendBackModal extends Modal {
  private readonly title: string
  private readonly submit: (comment: string) => void

  constructor(app: App, title: string, submit: (comment: string) => void) {
    super(app)
    this.title = title
    this.submit = submit
  }

  override onOpen(): void {
    this.contentEl.empty()
    this.contentEl.createEl('h2', { text: `Send back ${this.title}` })
    this.contentEl.createDiv({ cls: 'setting-item-description', text: 'Say what to change. The agent reads it in the card’s Notes.' })
    const input = this.contentEl.createEl('textarea', { cls: 'wi-send-back-comment', attr: { 'aria-label': 'Comment', rows: 4 } })
    const buttons = this.contentEl.createDiv({ cls: 'modal-button-container' })
    const send = buttons.createEl('button', { text: 'Send back', cls: 'mod-cta' })
    buttons.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close())
    const comment = () => input.value.replace(/\s+/g, ' ').trim()
    const sync = () => { send.disabled = comment() === '' }
    input.addEventListener('input', sync)
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        if (comment() !== '') this.submitAndClose(comment())
      }
    })
    send.addEventListener('click', () => this.submitAndClose(comment()))
    sync()
    input.focus()
  }

  override onClose(): void {
    this.contentEl.empty()
  }

  private submitAndClose(comment: string): void {
    this.close()
    this.submit(comment)
  }
}
