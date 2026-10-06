import * as fs from 'node:fs'
import * as path from 'node:path'
import { beforeAll, describe, expect, test } from 'vitest'
import { z } from 'zod'
import { harness } from './harness'
import { eventually, sionLink } from './steps'

const j = harness({ name: 'c1-record', state: 'sorted' })
const { quiet } = j
beforeAll(() => j.page.setDefaultTimeout(20_000))

const groups = () => path.join(j.world.output, 'groups.json')

const groupsFile = z.looseObject({
  groups: z.array(z.looseObject({ id: z.string(), destination: z.string().optional() }))
})

const edited = (text: string, destination: string | undefined) => {
  const record = groupsFile.parse(JSON.parse(text))
  return JSON.stringify(
    {
      ...record,
      groups: record.groups.map((group) =>
        group.id === 'group_2' ? { ...group, destination } : group
      )
    },
    null,
    2
  )
}

const editUntilShown = async (text: string, destination: string | undefined, shown: RegExp) => {
  let looks = 0
  await expect
    .poll(
      async () => {
        if (looks++ % 6 === 0)
          fs.writeFileSync(groups(), `${edited(text, destination)}${' '.repeat(looks)}`)
        return sionLink(j.page).innerText()
      },
      { interval: 1_000, timeout: 40_000 }
    )
    .toMatch(shown)
}

const kept: string[] = []

describe('the board following its record', () => {
  test('shows what a hand edit changed by itself, with nothing reloaded and no note said', async () => {
    await j.open()
    await eventually(() => sionLink(j.page).innerText()).toMatch(/3 to do/)
    kept.push(fs.readFileSync(groups(), 'utf8'))
    await j.page.evaluate(() => Object.assign(window, { stillHere: true }))

    await editUntilShown(kept[0]!, 'Sion', /5 to do/)
    expect(await j.page.evaluate(() => 'stillHere' in window), 'the page was not reloaded').toBe(
      true
    )
    expect(await j.page.getByRole('status').count(), 'no note is said').toBe(0)
    await quiet()
  })

  test('is not shown an older one when the record cannot be read whole, and takes up the record again as soon as it can', async () => {
    fs.writeFileSync(groups(), '{ "groups": [ { "id": "group_1", ')
    await j.page.waitForTimeout(4_500)
    expect(await sionLink(j.page).innerText(), 'what it had, not the older copy').toMatch(/5 to do/)

    await editUntilShown(kept[0]!, undefined, /3 to do/)
    await quiet()
  })
})
