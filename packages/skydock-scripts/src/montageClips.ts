import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import * as path from 'node:path'
import { outputKeyOf } from './fileStatus'
import { changedOnBoard } from './boardChange'
import { pathExists } from './lib/fs'
import { singleFlight } from './lib/singleFlight'
import { loadManifestAsync } from './manifest'
import { getGroupProcessedDir, processingAll, turnPhoto, writeCutProxy } from './process'
import { getCutProxyDir } from './proxy'
import type { Manifest, ManifestFile, ManifestGroup } from './types'
import { getManifestPath, getOutputDir, isVideoFile } from './utils'
import { isMontage } from './filed'
import { makeFileName } from './workspace'

/* What the board did to a clip — trimmed it, framed it, turned it — is the clip as the montage has it.
   It is not made into a file to edit the film: the film is edited on the clip's small copy and rendered from
   the clip itself, with that done again. Only a small copy that shows what was done is made, and it is
   named by what was done, so that a clip changed again has a new one and the old one goes. */
const signatureOf = (file: ManifestFile) =>
  createHash('sha1')
    .update(
      JSON.stringify([
        file.id ?? file.path,
        file.cropStart ?? null,
        file.cropEnd ?? null,
        file.frame ?? null,
        file.rotation ?? 0
      ])
    )
    .digest('hex')
    .slice(0, 8)

type MontageClip = {
  key: string
  /* the name the film calls the clip by: that of its copy when it has one, else the one it will have */
  name: string
  file: ManifestFile
  video: boolean
  changed: boolean
  /* where the small copy of a clip changed on the board is kept; photos only need one when turned */
  cut: string | null
}

const montageClips = (group: ManifestGroup, outputDir: string): MontageClip[] => {
  const { baseName } = getGroupProcessedDir(outputDir, group)
  const cuts = getCutProxyDir(outputDir, group.id)
  const taken = new Set(
    group.files.flatMap((f) => (f.processed ? [path.basename(f.processed.path)] : []))
  )
  return group.files.map((file) => {
    const video = isVideoFile(file.path)
    const ext = path.extname(file.path).slice(1).toLowerCase()
    const name = file.processed
      ? path.basename(file.processed.path)
      : makeFileName(baseName, file.mtime, ext, taken)
    const changed = changedOnBoard(file)
    const needsCut = video ? changed : Boolean(file.rotation)
    const stem = path.parse(name).name
    return {
      key: outputKeyOf(file),
      name,
      file,
      video,
      changed,
      cut: needsCut
        ? path.join(cuts, `${stem}~${signatureOf(file)}${video ? '.mp4' : path.extname(name)}`)
        : null
    }
  })
}

const makeCut = async (clip: MontageClip) => {
  if (!clip.cut) return null
  if (clip.video) return writeCutProxy(clip.file, clip.cut)
  try {
    await mkdir(path.dirname(clip.cut), { recursive: true })
    await copyFile(clip.file.path, clip.cut)
    await turnPhoto(clip.cut, clip.file.rotation as 90 | 180 | 270)
    return clip.cut
  } catch {
    await rm(clip.cut, { force: true })
    return null
  }
}

/* Each montage's clips changed on the board are given the small copy they are edited on, once what they
   are made from exists, and the small copies of what they were before are put away. Run each time a clip's
   own small copy lands, and when the editor is opened. */
const repairCutProxies = singleFlight(async (outputDir?: string) => {
  const dir = outputDir || getOutputDir()
  const manifest = await loadManifestAsync(getManifestPath(dir))
  return manifest ? await cutProxiesOf(manifest, dir) : 0
})

let cutting: Promise<unknown> = Promise.resolve()

/* one at a time: a small copy is written once, even if the editor and a pass ask for it together */
const cutProxiesOf = (manifest: Manifest, outputDir: string, only?: string) => {
  const turn = cutting.then(() => cutAll(manifest, outputDir, only))
  cutting = turn.catch(() => undefined)
  return turn
}

const cutAll = async (manifest: Manifest, outputDir: string, only?: string) => {
  let made = 0
  for (const group of manifest.groups) {
    if (!isMontage(group) || group.freed || (only !== undefined && group.id !== only)) continue
    const clips = montageClips(group, outputDir)
    for (const clip of clips) {
      if (!clip.cut || (await pathExists(clip.cut))) continue
      if (clip.video && !(clip.file.proxy && (await pathExists(clip.file.proxy)))) continue
      if (!(await pathExists(clip.file.path))) continue
      if ((await makeCut(clip)) !== null) made++
    }
    const wanted = new Set(clips.flatMap((c) => (c.cut ? [path.basename(c.cut)] : [])))
    const folder = getCutProxyDir(outputDir, group.id)
    if (processingAll().some((one) => one.groupIds.includes(group.id))) continue
    for (const name of await readdir(folder).catch(() => [] as string[]))
      if (!wanted.has(name) && !name.startsWith('.'))
        await rm(path.join(folder, name), { force: true })
  }
  if (made > 0) console.log(`[Process] Cut ${made} small copy(ies) for a montage.`)
  return made
}

export { cutProxiesOf, montageClips, repairCutProxies }
export type { MontageClip }
