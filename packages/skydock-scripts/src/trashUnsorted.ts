import { access, rm } from 'node:fs/promises'
import * as path from 'node:path'
import { moveFile } from './lib/fs'
import { inJob } from './live'
import { getProxyPath, stopProxiesOf } from './proxy'
import { isMontage } from './filed'
import { slugOf } from './sending'
import { passengerOf } from './workspace'
import type { Manifest } from './types'
import { getTrashDir } from './utils'

const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false
  )

const dropFromBoard = (manifest: Manifest, ids: Set<string>) => {
  manifest.files = manifest.files.filter((f) => !f.id || !ids.has(f.id))
  manifest.groups = manifest.groups
    .map((g) => ({ ...g, files: g.files.filter((f) => !f.id || !ids.has(f.id)) }))
    .filter((g) => g.files.length > 0)
}

const trashUnsorted = async (
  manifest: Manifest,
  ids: Set<string>,
  outputDir: string,
  trashDir = getTrashDir()
) => {
  const going = manifest.files.filter((f) => f.id && ids.has(f.id))
  if (going.length === 0) throw new Error('Those files are no longer on the board.')
  const copy = going.find((f) => f.copyOf)
  if (copy)
    throw new Error(
      `${copy.filename} is a copy — take it out of its jump instead; its original stays.`
    )
  const groups = new Map<string, Manifest['groups'][number]>()
  for (const g of manifest.groups)
    for (const h of g.files) if (h.id && !groups.has(h.id)) groups.set(h.id, g)
  const groupOf = (id: string | undefined) => (id ? groups.get(id) : undefined)
  const copiesOf = (f: { id?: string }) => manifest.files.filter((c) => c.copyOf === f.id)
  const held = going.find((f) =>
    copiesOf(f).some((c) => {
      const group = groupOf(c.id)
      return group && !group.uploaded
    })
  )
  if (held)
    throw new Error(
      `${held.filename} was copied into a jump, which still needs it — take the copy out first.`
    )

  const originals = path.join(outputDir, 'original_files')
  const places = new Set(
    going.map((f) => {
      const group = groupOf(f.id)
      if (group && isMontage(group)) return `montage-${slugOf(passengerOf(group)) || 'montage'}`
      const place = group?.destination ?? f.destination
      return place ? `dropzone-${slugOf(place) || 'dropzone'}` : 'unsorted'
    })
  )
  const [only] = [...places]
  const from = places.size === 1 && only ? only : 'unsorted'
  const bin = path.join(trashDir, `${from}-${new Date().toISOString().replace(/[:.]/g, '-')}`)

  stopProxiesOf(going.map((f) => f.path))
  await inJob({ type: 'trash', label: '', total: going.length }, async (binning) => {
    for (const file of going) {
      binning.working(file.filename)
      const within = path.relative(originals, file.path)
      const to = path.join(bin, within.startsWith('..') ? path.basename(file.path) : within)
      if (await exists(file.path)) await moveFile(file.path, to)
      for (const made of [file.processed?.path, getProxyPath(file, outputDir)])
        if (made) await rm(made, { force: true })
      binning.step()
    }
  })

  for (const file of going)
    for (const copy of copiesOf(file)) {
      const group = groupOf(copy.id)
      if (!group) continue
      for (const entry of [copy, ...group.files.filter((h) => h.id === copy.id)]) entry.freed = true
    }
  dropFromBoard(
    manifest,
    new Set([
      ...ids,
      ...going.flatMap((f) => copiesOf(f).flatMap((c) => (c.id && !groupOf(c.id) ? [c.id] : [])))
    ])
  )

  return {
    count: going.length,
    bytes: going.reduce((n, f) => n + f.size, 0),
    bin
  }
}

export { dropFromBoard, trashUnsorted }
