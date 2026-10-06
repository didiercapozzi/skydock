import type { Locator, Page } from 'playwright'
import type { World } from './app'
import { groupsOf, manifestOf } from './record'

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

const jumpsOf = (world: World) =>
  recordOf(world).map((g) => ({
    destination: g.destination,
    montage: g.montage,
    files: g.files.map((f) => f.name),
    copies: g.files.filter((f) => f.copy).length
  }))

const jumpHolding = (world: World, filename: string) =>
  jumpsOf(world).filter((jump) => jump.files.includes(filename))

const recordsOf = (world: World, filename: string) =>
  recordOf(world).flatMap((g) =>
    g.files.filter((f) => f.name === filename).map(({ copy, trimmed }) => ({ copy, trimmed }))
  )

const timeOf = (world: World, filename: string) =>
  manifestOf(world).files.find((f) => f.filename === filename && f.id && !f.id.includes('~'))?.mtime

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

const pick = (row: Locator) => row.getByRole('button', { name: 'Pick', exact: true }).click()

const scan = async (page: Page) => {
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/scan')),
    page.getByRole('button', { name: 'Scan' }).click()
  ])
}

const drag = async (page: Page, source: Locator, target: Locator, key?: 'Alt') => {
  if (key) await page.keyboard.down(key)
  await source.dragTo(target)
  if (key) await page.keyboard.up(key)
}

export { drag, holds, jumpHolding, jumpsOf, pick, recordsOf, scan, timeOf }
