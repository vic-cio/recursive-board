/** Shared plan for creating the first board in an empty vault. */
import { fileNameFor, fileNameStem, newId, today } from './schema.ts'
import { renderRootWorkItem, renderWorkItem } from './work-item.ts'

export interface FirstBoardFile {
  path: string
  text: string
}

export interface FirstBoardPlan {
  /** The plugin sets this as `defaultRoot` in the board settings. */
  rootStem: string
  files: FirstBoardFile[]
}

/** Render every file before the plugin starts writing, so shared content rules stay authoritative. */
export function firstBoardPlan(options: {
  title: string
  takenIds: ReadonlySet<string>
  takenStems: ReadonlySet<string>
  extraSections?: readonly string[]
  now?: Date
  random?: () => number
}): FirstBoardPlan {
  const title = options.title.trim()
  if (title === '') throw new Error('A board needs a name.')
  const stamp = today(options.now)
  const rootId = newId(options.takenIds, options.random)
  const rootStem = fileNameFor(title, rootId, options.takenStems)
  const childTakenIds = new Set(options.takenIds)
  childTakenIds.add(rootId)
  const childId = newId(childTakenIds, options.random)
  const childTakenStems = new Set(options.takenStems)
  childTakenStems.add(rootStem.toLowerCase())
  const childStem = fileNameFor('Try moving this card', childId, childTakenStems)

  return {
    rootStem,
    files: [
      {
        path: `${rootStem}.md`,
        text: renderRootWorkItem({ id: rootId, title, created: stamp, updated: stamp }, options.extraSections),
      },
      {
        path: `${childStem}.md`,
        text: renderWorkItem({
          id: childId,
          title: 'Try moving this card',
          status: 'backlog',
          parentStem: rootStem,
          created: stamp,
          updated: stamp,
          template: 'first-board-card',
        }, options.extraSections),
      },
    ],
  }
}

/** A normalized title stem for comparing a requested name with an existing root. */
export function firstBoardNameStem(title: string): string {
  return fileNameStem(title)
}
