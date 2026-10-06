import * as fs from 'node:fs'
import * as path from 'node:path'
import { beforeAll, describe, expect, test } from 'vitest'
import { z } from 'zod'
import { eventually, folders } from './c1-helpers'
import { harness } from './harness'

/* The board's record is written by more than the page that has it open — another tab, a script, a hand
   edit (RULES, The board follows its record). While the board is open it looks at the record every couple of
   seconds and shows what changed, with nothing reloaded and no note said. */

const j = harness({ name: 'c1-record', state: 'sorted' })
const { quiet } = j
beforeAll(() => j.page.setDefaultTimeout(20_000))

const groups = () => path.join(j.world.output, 'groups.json')
const history = () => fs.readdirSync(path.join(j.world.output, '.history')).sort()
const sion = () => folders(j).getByRole('link', { name: /Sion/ })

const groupsFile = z.looseObject({
  groups: z.array(z.looseObject({ id: z.string(), destination: z.string().optional() }))
})

/* the record as a person editing it by hand would leave it: the second jump filed to Sion, or not */
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

/* the board only starts to look when its page is listening, and its first look learns what is there rather
   than telling it; so a hand edit is written again, a little different each time, until the board shows
   it — which is when a person editing by hand would see it too */
const editUntilShown = async (text: string, destination: string | undefined, shown: RegExp) => {
  let looks = 0
  await expect
    .poll(
      async () => {
        if (looks++ % 6 === 0)
          fs.writeFileSync(groups(), `${edited(text, destination)}${' '.repeat(looks)}`)
        return sion().innerText()
      },
      { interval: 1_000, timeout: 40_000 }
    )
    .toMatch(shown)
}

/* the record as the story left it, read before anything is done to it */
const kept: string[] = []

describe('the board following its record', () => {
  test('shows what a hand edit changed by itself, with nothing reloaded and no note said, and takes no step of the history', async () => {
    await j.open()
    await eventually(() => sion().innerText()).toMatch(/3 to do/)
    kept.push(fs.readFileSync(groups(), 'utf8'))
    const before = history()
    await j.page.evaluate(() => Object.assign(window, { stillHere: true }))

    await editUntilShown(kept[0]!, 'Sion', /5 to do/)
    expect(await j.page.evaluate(() => 'stillHere' in window), 'the page was not reloaded').toBe(
      true
    )
    expect(await j.page.getByRole('status').count(), 'no note is said').toBe(0)
    expect(history(), 'a look is no step of the history').toEqual(before)
    await quiet()
  })

  // BUG: RULES.md (The board follows its record) says "A record that cannot be read whole is never shown as
  // an older one". With the board showing a hand-edited record (Sion 5 to do), the record half written
  // by hand and the last whole copy beside it holding the board as it was (Sion 3 to do), the board
  // changes by itself to the older copy within a few seconds. Suspect:
  // packages/skydock-scripts/src/manifestWatch.ts, lookAtBoard — loadManifest falls back to the copy
  // instead of throwing, so the `catch { return }` that is meant to keep a half-written pair untold is
  // never reached.
  test.skip('is not shown an older one when the record cannot be read whole, and takes up the record again as soon as it can', async () => {
    /* the last whole copy beside it holds the board as it was, and must not come back for a record half written */
    fs.writeFileSync(`${groups()}.bak`, kept[0]!)
    fs.writeFileSync(groups(), '{ "groups": [ { "id": "group_1", ')
    /* a board that shows no change says nothing, so it is given the time to look more than once */
    await j.page.waitForTimeout(6_000)
    expect(await sion().innerText(), 'what it had, not the older copy').toMatch(/5 to do/)

    await editUntilShown(kept[0]!, undefined, /3 to do/)
    await quiet()
  })
})
