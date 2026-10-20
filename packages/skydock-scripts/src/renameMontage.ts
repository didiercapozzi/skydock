import { mkdir, readdir, rename, rm } from 'node:fs/promises'
import * as path from 'node:path'
import { busyWith } from './busy'
import { editPathOf, readOrSetAside, saveEdit } from './filmEdit'
import { pathExists } from './lib/fs'
import { editNameOf, filmNameOf } from './montageNames'
import { getGroupProcessedDir } from './process'
import { keepEdit } from './projectHistory'
import { getCutProxyDir } from './proxy'
import type { ManifestFile, ManifestGroup } from './types'
import { hasCompletePassenger, passengerOf } from './workspace'

const moveIfThere = async (from: string, to: string) => {
  if (from === to || !(await pathExists(from))) return
  await mkdir(path.dirname(to), { recursive: true })
  await rename(from, to)
}

const renameEntries = async (dir: string, renamed: (name: string) => string) => {
  for (const name of await readdir(dir).catch(() => [] as string[]))
    await moveIfThere(path.join(dir, name), path.join(dir, renamed(name)))
}

const renameEditedMontage = async ({
  outputDir,
  before,
  after,
  sharing,
  files
}: {
  outputDir: string
  before: ManifestGroup
  after: ManifestGroup
  sharing: ManifestGroup[]
  files: ManifestFile[]
}) => {
  if (!hasCompletePassenger(after.passenger))
    return 'A montage with an edit keeps a name — start the edit again to take its name away.'
  const from = getGroupProcessedDir(outputDir, before)
  const to = getGroupProcessedDir(outputDir, after)
  if (from.dir === to.dir && from.baseName === to.baseName) return null
  const ids = sharing.map((g) => g.id)
  const busy = busyWith({ groupIds: ids })
  if (busy === 'rendering') return 'Its film is being rendered — rename it once the render is done.'
  if (busy === 'uploading') return 'It is being uploaded — rename it once the upload is done.'
  if (busy) return 'It is being processed — rename it once that is done.'
  const sameFolder = from.dir.toLowerCase() === to.dir.toLowerCase()
  if (!sameFolder && (await pathExists(to.dir)))
    return `There is already a montage folder called ${path.basename(to.dir)} — choose another name.`

  const editPath = editPathOf(outputDir, before)
  const { edit } = await readOrSetAside(outputDir, editPath)
  await keepEdit(outputDir, from.dir, from.baseName)
  if (from.dir !== to.dir) {
    const passing = `${from.dir}.renaming`
    await rename(from.dir, passing)
    await moveIfThere(passing, to.dir)
  }
  const renamed = (name: string) =>
    name.startsWith(`${from.baseName}_`)
      ? `${to.baseName}${name.slice(from.baseName.length)}`
      : name
  for (const media of ['videos', 'photos']) await renameEntries(path.join(to.dir, media), renamed)
  for (const id of ids) await renameEntries(getCutProxyDir(outputDir, id), renamed)
  await moveIfThere(
    path.join(to.dir, filmNameOf(from.baseName)),
    path.join(to.dir, filmNameOf(to.baseName))
  )
  if (edit) {
    const oldName = passengerOf(before).trim()
    const newName = passengerOf(after).trim()
    await saveEdit(path.join(to.dir, editNameOf(to.baseName)), {
      ...edit,
      clips: edit.clips.map((clip) => ({ ...clip, name: renamed(clip.name) })),
      texts: edit.texts.map((text) => (text.text === oldName ? { ...text, text: newName } : text))
    })
    if (from.baseName !== to.baseName)
      await rm(path.join(to.dir, editNameOf(from.baseName)), { force: true })
  }
  const inside = `${from.dir}${path.sep}`
  for (const file of files) {
    const made = file.processed
    if (!made || !made.path.startsWith(inside)) continue
    const rest = path.relative(from.dir, made.path)
    made.path = path.join(to.dir, path.dirname(rest), renamed(path.basename(rest)))
    delete file.uploaded
  }
  return null
}

export { renameEditedMontage }
