import { Modal, type App } from 'obsidian'

export class CreateBoardModal extends Modal {
  private readonly submit: (title: string) => void

  constructor(app: App, submit: (title: string) => void) {
    super(app)
    this.submit = submit
  }

  override onOpen(): void {
    this.contentEl.empty()
    this.contentEl.createEl('h2', { text: 'Create your first board' })
    const input = this.contentEl.createEl('input', {
      type: 'text',
      value: 'Main',
      attr: { 'aria-label': 'Board name' },
    })
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        this.submitAndClose(input.value)
      }
    })
    const buttons = this.contentEl.createDiv({ cls: 'modal-button-container' })
    buttons.createEl('button', { text: 'Create board', cls: 'mod-cta' })
      .addEventListener('click', () => this.submitAndClose(input.value))
    buttons.createEl('button', { text: 'Cancel' })
      .addEventListener('click', () => this.close())
    input.focus()
    input.select()
  }

  override onClose(): void {
    this.contentEl.empty()
  }

  private submitAndClose(title: string): void {
    this.close()
    this.submit(title)
  }
}
