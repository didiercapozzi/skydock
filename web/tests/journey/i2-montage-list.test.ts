import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'
import { z } from 'zod'
import { startFakeStorage } from './fake-storage'
import type { FakeStorage } from './fake-storage'
import { harness } from './harness'
import { connectStorage, said, sendAsUsual, stored, STEM } from './i2-helpers'

let storage: FakeStorage
const j = harness({
  name: 'i2-montage-list',
  state: 'i2-ready',
  prepare: async () => {
    storage = await startFakeStorage()
  }
})
afterAll(async () => storage?.stop())

const listSchema = z.object({
  version: z.number(),
  montages: z.array(
    z.object({
      folder: z.string(),
      firstname: z.string(),
      lastname: z.string(),
      day: z.string(),
      videos: z.number(),
      photos: z.number(),
      uploadedAt: z.number(),
      shareUrl: z.string().optional(),
      film: z.string().optional(),
      backup: z.string().optional(),
      freed: z.unknown().optional(),
      emailed: z.object({ at: z.number(), to: z.string().optional() }).optional(),
      items: z.array(z.object({ name: z.string(), dir: z.string(), size: z.number() }))
    })
  )
})
const LIST = () => path.join(storage.root, 'club', 'skydock-montages.json')
const readList = () => listSchema.parse(JSON.parse(fs.readFileSync(LIST(), 'utf8')))
const main = () => j.page.locator('main')
const reopen = async () => {
  await j.open()
  await j.page.getByRole('link', { name: /Luc Favre/ }).click()
}

describe("the storage's list of montages", () => {
  test('is written once a montage is uploaded, and says who it was for, the day, how much, where and its link', async () => {
    await j.open()
    await j.page.getByRole('link', { name: /Luc Favre/ }).click()
    await j.see('Upload…')
    await connectStorage(j.page, storage)
    await sendAsUsual(j.page)
    await j.see('Send Luc the link', 60_000)
    await expect.poll(() => fs.existsSync(LIST()), { timeout: 20_000 }).toBe(true)

    const [montage, ...others] = readList().montages
    expect(others).toEqual([])
    expect(montage).toMatchObject({
      folder: '/club/Films',
      firstname: 'Luc',
      lastname: 'Favre',
      day: '06.09.2026',
      videos: 2,
      photos: 1,
      film: `/club/Films/${STEM}.mp4`,
      backup: `/club/Backup/luc-favre/${STEM}.full.zip`
    })
    expect(montage?.shareUrl).toBe((await storage.admin.shareLinks())[0]?.url)
    expect(montage?.items.map((item) => [item.dir, item.name])).toEqual([
      ['/club/Backup/luc-favre', `${STEM}.full.zip`],
      ['/club/Films', 'photos/'],
      ['/club/Films', `${STEM}.mp4`]
    ])
    expect(montage?.items.every((item) => item.size > 0)).toBe(true)
    expect(montage?.freed).toBeUndefined()
    expect(montage?.emailed).toBeUndefined()
    expect(stored(storage)).toContain('skydock-montages.json')
    await j.quiet()
  })

  test.skip('is asked whether the link still works: a link revoked on the storage is shown as no link, and nothing offers it', async () => {
    const [link] = await storage.admin.shareLinks()
    await storage.admin.revokeLink(link!.id)
    await reopen()
    await said(main()).toContain('No link')
    await said(main()).toContain('Create link')
    await said(main()).not.toContain('Copy link')
    await said(main()).not.toContain('Email Luc')
    expect(readList().montages).toHaveLength(1)
    await j.quiet()
  })

  test('is asked whether the folder is still there: a montage whose folder is gone is shown as no longer on the storage, and stays on the list', async () => {
    const films = path.join(storage.root, 'club', 'Films')
    const aside = path.join(storage.root, 'Films.aside')
    fs.renameSync(films, aside)
    await reopen()
    await said(main()).toMatch(
      /Uploaded .*, but these are no longer on the storage: .*upload again/
    )
    await said(main()).toContain('Upload it to the storage')
    expect(readList().montages).toHaveLength(1)

    fs.renameSync(aside, films)
    await storage.admin.unreachable(true)
    await reopen()
    await storage.admin.unreachable(false)
    await reopen()
    await said(main()).toContain('Send Luc the link')
    await j.quiet()
  })
})
