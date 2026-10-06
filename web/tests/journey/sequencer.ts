import { BaseSequencer } from 'vitest/node'
import type { TestSpecification } from 'vitest/node'

/* The files of the journey run in the order of their names, always: some start from a state another kept
   (the story, then the montage that is made ready, then what is done to it), so an order that depended on how
   long each took last time would be a journey that sometimes cannot find its own footing. */
class InOrder extends BaseSequencer {
  override async sort(files: TestSpecification[]) {
    return [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId))
  }
}

export { InOrder }
