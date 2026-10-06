import { BaseSequencer } from 'vitest/node'
import type { TestSpecification } from 'vitest/node'

class InOrder extends BaseSequencer {
  override async sort(files: TestSpecification[]) {
    return [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId))
  }
}

export { InOrder }
