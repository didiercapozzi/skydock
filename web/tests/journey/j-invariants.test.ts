import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'
import { describe, expect, test } from 'vitest'
import { harness } from './harness'
import { CLIPS, dayFolder, makeClip } from './media'
import { loadState } from './saved'
import { recordProblems, treeOf } from './invariants'

/* What holds in every chapter, walked on its own: the record is the record its schema describes, the work
   folder holds what RULES.md says it holds, and the page is never held up while the app works. */

const here = path.dirname(url.fileURLToPath(import.meta.url))
const LISTINGS = path.join(here, 'listings')

describe('the record and the work folder', () => {
  test('the record parses with the app’s own schema in every state the journey keeps', () => {
    for (const state of ['sorted', 'processed']) {
      const world = loadState(state)
      expect(recordProblems(world), `the record of the state ${state}`).toEqual([])
      fs.rmSync(world.root, { recursive: true, force: true })
    }
  })

  test('the work folder holds what RULES.md says once the files are processed, as the stored listing says', () => {
    const world = loadState('processed')
    const listing = treeOf(world.output).join('\n') + '\n'
    fs.rmSync(world.root, { recursive: true, force: true })
    const file = path.join(LISTINGS, 'processed.txt')
    if (process.env.JOURNEY_UPDATE === '1' || !fs.existsSync(file)) {
      fs.mkdirSync(LISTINGS, { recursive: true })
      fs.writeFileSync(file, listing)
    }
    expect(listing).toEqual(fs.readFileSync(file, 'utf8'))
  })
})

/* a task of the page longer than this is a page a person feels hold still */
const LONG = 500

const j = harness({ name: 'j-invariants', state: 'sorted' })

describe('the page while the app works', () => {
  test('is never held up while the app scans, copies files in and processes them', async () => {
    await j.context.addInitScript((limit) => {
      const w = window as unknown as { __long: number[] }
      w.__long = []
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          if (entry.duration > limit) w.__long.push(entry.duration)
      }).observe({ type: 'longtask', buffered: true })
    }, LONG)
    await j.open()
    await j.see(/jumps? (is|are) waiting for a home/)

    /* a scan of new footage */
    for (const [name, when] of CLIPS.slice(0, 2))
      makeClip(path.join(dayFolder(j.world, when), `again-${name}`), when, 2)
    await j.page.getByRole('button', { name: 'Scan' }).click()
    await j.page
      .getByText(/Scanning/)
      .first()
      .waitFor({ state: 'detached', timeout: 60_000 })

    /* processing a destination */
    await j.page
      .getByRole('navigation', { name: 'Folders' })
      .getByRole('link', { name: /Sion/ })
      .click()
    await j.page.getByRole('button', { name: /^Process \d+ files?$/ }).click()
    await j.see(/files? (is|are) ready to upload/, 60_000)

    const held = await j.page.evaluate(() => (window as unknown as { __long: number[] }).__long)
    expect(held, 'tasks of the page longer than half a second').toEqual([])
    await j.quiet()
  })
})
