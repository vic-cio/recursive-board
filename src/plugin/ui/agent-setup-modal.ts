import { Modal, Notice, setIcon, type App } from 'obsidian'

import { playbookBlock, playbookPasteBlocks } from '../../shared/playbook.ts'
import { PLAYBOOK } from '../playbook.ts'

export const AGENT_SETUP_ICON = 'bot'

const PLAYBOOK_URL = 'https://github.com/vic-cio/recursive-board/blob/main/docs/playbook.md'

/**
 * Shows the playbook's recommended agent setup, as `wi setup` prints it, with a copy button for
 * each paste-ready block. It writes nothing into the vault (docs/adr/0069).
 */
export class AgentSetupModal extends Modal {
  constructor(app: App) {
    super(app)
  }

  override onOpen(): void {
    const el = this.contentEl
    el.empty()
    el.addClass('wi-agent-setup')
    el.createEl('h2', { text: 'Recommended agent setup' })
    el.createDiv({
      cls: 'setting-item-description',
      text: 'Optional. Recursive Board works the same without it. This window writes nothing to the vault: copy a text and paste it where you choose.',
    })

    const summary = playbookBlock(PLAYBOOK, 'summary')
    if (summary !== null) el.createEl('pre', { cls: 'wi-agent-setup-text', text: summary })

    for (const block of playbookPasteBlocks(PLAYBOOK)) {
      const section = el.createDiv('wi-agent-setup-block')
      const head = section.createDiv('wi-agent-setup-head')
      head.createEl('h3', { text: block.title })
      const copy = head.createEl('button', { attr: { 'aria-label': `Copy: ${block.title}` } })
      setIcon(copy.createSpan(), 'copy')
      copy.createSpan({ text: 'Copy' })
      copy.addEventListener('click', () => {
        void navigator.clipboard.writeText(`${block.text}\n`).then(
          () => new Notice('Copied. Paste it where you choose.'),
          () => new Notice('Could not copy the text.'),
        )
      })
      const details = section.createEl('details')
      details.createEl('summary', { text: 'Show the text' })
      details.createEl('pre', { cls: 'wi-agent-setup-text', text: block.text })
    }

    const footer = el.createDiv({ cls: 'setting-item-description' })
    footer.createSpan({ text: 'The full playbook explains each part and the risk of bypass permissions: ' })
    footer.createEl('a', { text: 'docs/playbook.md', href: PLAYBOOK_URL })
    footer.createSpan({ text: '. In a terminal, wi doctor checks a vault against it.' })

    const buttons = el.createDiv({ cls: 'modal-button-container' })
    buttons.createEl('button', { text: 'Close' }).addEventListener('click', () => this.close())
  }

  override onClose(): void {
    this.contentEl.empty()
  }
}
