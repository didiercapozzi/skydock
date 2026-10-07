import { BaseSequencer } from 'vitest/node'
import type { TestSpecification } from 'vitest/node'

const story = (file: TestSpecification) => (file.moduleId.endsWith('/journey.test.ts') ? 0 : 1)

class InOrder extends BaseSequencer {
  override async sort(files: TestSpecification[]) {
    return [...files].sort((a, b) => story(a) - story(b) || a.moduleId.localeCompare(b.moduleId))
  }
}

export { InOrder }
