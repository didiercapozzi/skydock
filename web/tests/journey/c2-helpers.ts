import type { Locator, Page } from 'playwright'
import type { World } from './app'
import { groupsOf, manifestOf } from './record'

/* What the sorting chapters share: reading where the jumps are as the record on disk has them, and a drag with
   a key held, as a person drags with alt. */

/* what the record says of every jump, the name of each file found as a person would read it — a copy has the
   name of its original */
const recordOf = (world: World) => {
  const names = new Map(
    manifestOf(world).files.flatMap((f) => (f.id ? [[f.id, f.filename] as const] : []))
  )
  return groupsOf(world).map((g) => ({
    destination: g.destination,
    montage: g.passenger ? `${g.passenger.firstname} ${g.passenger.lastname}` : undefined,
    files: g.files.map((f) => ({
      name: names.get(f.id) ?? names.get(f.id.replace(/~\d+$/, '')) ?? f.id,
      copy: f.id.includes('~'),
      trimmed: (f.cropStart ?? 0) > 0 || (f.cropEnd ?? 0) > 0
    }))
  }))
}

/* a jump as the record has it: where it is filed, the montage it is, the names of its files, how many are copies */
const jumpsOf = (world: World) =>
  recordOf(world).map((g) => ({
    destination: g.destination,
    montage: g.montage,
    files: g.files.map((f) => f.name),
    copies: g.files.filter((f) => f.copy).length
  }))

/* the jumps that hold a file, by the file's name */
const jumpHolding = (world: World, filename: string) =>
  jumpsOf(world).filter((jump) => jump.files.includes(filename))

/* every place a file is kept in a jump — the file itself and each copy of it — with whether it is trimmed there */
const recordsOf = (world: World, filename: string) =>
  recordOf(world).flatMap((g) =>
    g.files.filter((f) => f.name === filename).map(({ copy, trimmed }) => ({ copy, trimmed }))
  )

/* when the record says a file was shot — corrected, where its jump was */
const timeOf = (world: World, filename: string) =>
  manifestOf(world).files.find((f) => f.filename === filename && f.id && !f.id.includes('~'))?.mtime

/* the names of the files a destination holds, filed there in a jump or on their own */
const holds = (world: World, destination: string) =>
  [
    ...new Set([
      ...jumpsOf(world)
        .filter((jump) => jump.destination === destination)
        .flatMap((jump) => jump.files),
      ...manifestOf(world)
        .files.filter((f) => f.destination === destination)
        .map((f) => f.filename)
    ])
  ].sort()

/* picked by its tick */
const pick = (row: Locator) => row.getByRole('button', { name: 'Pick', exact: true }).click()

/* Scan pressed, and waited for until the server has answered it */
const scan = async (page: Page) => {
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/scan')),
    page.getByRole('button', { name: 'Scan' }).click()
  ])
}

/* dragged from one place to another with a key held down, or none */
const drag = async (page: Page, source: Locator, target: Locator, key?: 'Alt') => {
  if (key) await page.keyboard.down(key)
  await source.dragTo(target)
  if (key) await page.keyboard.up(key)
}

export { drag, holds, jumpHolding, jumpsOf, pick, recordsOf, scan, timeOf }
