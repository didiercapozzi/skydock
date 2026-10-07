import { BaseSequencer } from 'vitest/node'
import type { TestSpecification } from 'vitest/node'

/* The files of the journey run in the order of their names, always, the story first: every other file starts
   from a state the story keeps, so an order that depended on how long each took last time would be a journey
   that sometimes cannot find its own footing. */
const story = (file: TestSpecification) => (file.moduleId.endsWith('/journey.test.ts') ? 0 : 1)

class InOrder extends BaseSequencer {
  override async sort(files: TestSpecification[]) {
    return [...files].sort((a, b) => story(a) - story(b) || a.moduleId.localeCompare(b.moduleId))
  }
}

export { InOrder }
