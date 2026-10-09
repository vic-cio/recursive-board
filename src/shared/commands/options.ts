/** How the card edit commands read their flags and their environment, as wi.ts did. */
import { UsageError, type CommandContext, type Values } from './command.ts'

/** A string flag's value, or undefined when it was not given. */
export function text(values: Values, key: string): string | undefined {
  const value = values[key]
  return typeof value === 'string' ? value : undefined
}

/** A flag that must hold one line of text. */
export function singleLineOption(values: Values, key: string): string {
  const value = values[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new UsageError(`--${key} needs non-empty text.`)
  }
  if (/[\r\n]/.test(value)) throw new UsageError(`--${key} must be one line.`)
  return value.trim()
}

/** An environment variable's text from the context, or undefined when it is unset or blank. */
export function envText(context: CommandContext, name: string): string | undefined {
  const value = context.env[name]?.trim()
  return value ? value : undefined
}

/** The words after the command, as one reference. */
export function refOf(positionals: string[]): string {
  return positionals.slice(1).join(' ').trim()
}
