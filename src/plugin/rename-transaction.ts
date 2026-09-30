/** Restore a renamed resource when its matching settings save fails. */
export async function renameThenSave(
  renameTo: (path: string) => Promise<void>,
  from: string,
  to: string,
  save: () => Promise<void>,
): Promise<void> {
  await renameTo(to)
  try {
    await save()
  } catch (error) {
    try {
      await renameTo(from)
    } catch (rollbackError) {
      const reason = error instanceof Error ? error.message : String(error)
      const rollback = rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
      throw new Error(`${reason}; folder rollback also failed: ${rollback}`)
    }
    throw error
  }
}
