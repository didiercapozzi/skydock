import { describe, expect, test } from 'vitest'
import { jumpsOf } from './c2-helpers'
import { harness } from './harness'
import { cardOf, dialogNamed } from './steps'

const j = harness({
  name: 'c2-merge-date',
  state: 'sorted',
  viewport: { width: 1400, height: 1000 }
})

describe('two jumps side by side', () => {
  test('are merged onto the start of the jump chosen, not onto the start of the longest run', async () => {
    await j.open()
    await j.see('2 jumps are waiting for a home')
    const compare = dialogNamed(j.page, 'Compare jumps')
    await cardOf(j.page, 'Jump 2').click()
    await cardOf(j.page, 'Jump 1').click({ modifiers: ['Control'] })
    await compare.waitFor()
    await compare.getByRole('button', { name: 'Merge' }).click()
    await j.page.getByLabel(/^Jump 1 — /).check()
    await j.page.getByRole('button', { name: 'Confirm merge' }).click()
    await compare.waitFor({ state: 'detached' })
    await j.see('1 jump is waiting for a home')
    await j.see(/Sat 5 Sept · 14:30/)
    await expect.poll(() => jumpsOf(j.world).filter((jump) => !jump.destination)).toHaveLength(1)
    await j.quiet()
  })
})
