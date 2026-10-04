import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  getGroupProcessedDir,
  isNamedMontage,
  passengerOf,
  saveManifest,
  statProxies,
  waitingForProxy,
  messageOf
} from '@skydock/scripts'
import { openInEditor } from '../../../../packages/skydock-scripts/src/editor'
import { mediaSeconds } from '../../../../packages/skydock-scripts/src/lib/media'
import { createMontageProject } from '../../../../packages/skydock-scripts/src/montage'
import { writeCutProxy } from '../../../../packages/skydock-scripts/src/process'
import { getCutProxyDir } from '../../../../packages/skydock-scripts/src/proxy'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* A processed montage gets an editing project, the template as its owner made it with the clips in
   its bin, and the project is opened in the same press: it exists to be edited (RULES, The editing project). */
const montage: Intent = async ({ data, manifest, manifestPath, outputDir, refuse, latest }) => {
  const group = manifest.groups.find((g) => g.id === data.groupId)
  if (!group) return refuse('Group not found.')
  if (!isNamedMontage(group))
    return refuse('Only a named montage gets a project — give it a name first.')
  if (!group.processed) return refuse('Process this montage before making its project.')
  const { dir: groupDir, baseName } = getGroupProcessedDir(outputDir, group)
  if (!fs.existsSync(groupDir)) return refuse('Processed folder not found. Process it again.')
  if (fs.readdirSync(groupDir).some((f) => f.endsWith('.kdenlive')))
    return refuse('This montage already has a project — open it in kdenlive.')
  const waiting = waitingForProxy(group.files, statProxies(manifest, outputDir))
  if (waiting.length > 0)
    return refuse(
      `${waiting.length === 1 ? '1 clip is' : `${waiting.length} clips are`} still getting a proxy — the project is made once each one has it, or has failed to.`
    )
  try {
    const copiesIn = (media: string) => {
      const dir = path.join(groupDir, media)
      return fs.existsSync(dir)
        ? fs
            .readdirSync(dir, { withFileTypes: true })
            .filter((e) => e.isFile())
            .map((e) => path.join(dir, e.name))
            .sort()
        : []
    }
    const videos = copiesIn('videos')
    const photos = videos.length === 0 ? copiesIn('photos') : []
    const copies = new Map(
      group.files.flatMap((f) => (f.processed ? [[path.basename(f.processed.path), f]] : []))
    )
    const clips = []
    for (const file of videos) {
      const proxy = path.join(getCutProxyDir(outputDir, group.id), `${path.parse(file).name}.mp4`)
      const measured = copies.get(path.basename(file))
      const source = measured && manifest.files.find((f) => f.id === measured.id)
      if (!fs.existsSync(proxy) && measured && source?.proxy)
        await writeCutProxy({ ...measured, proxy: source.proxy }, file, outputDir, group.id)
      const hasProxy = fs.existsSync(proxy)
      const seconds = measured?.moments ? await mediaSeconds(hasProxy ? proxy : file) : null
      clips.push({
        path: file,
        ...(hasProxy ? { proxy } : {}),
        moments: measured?.moments,
        cropStart: measured?.cropStart,
        ...(seconds !== null ? { seconds } : {})
      })
    }
    const made = createMontageProject({
      groupDir,
      outputDir,
      baseName,
      title: passengerOf(group).trim() || group.label,
      template: data.template,
      photos,
      clips
    })
    const board = latest()
    const target = board.groups.find((g) => g.id === group.id)
    if (target)
      target.montage = {
        projectPath: made.projectPath,
        filmPath: made.filmPath,
        template: made.template,
        clips: made.clips,
        at: Math.floor(Date.now() / 1000)
      }
    saveManifest(manifestPath, board)
    const opened = await openInEditor(made.projectPath)
    return {
      ...boardAnswer(board),
      montage: {
        clips: made.clips,
        photos: made.photos,
        missingAssets: made.missingAssets,
        opened: opened.opened,
        openCommand: opened.command,
        openReason: opened.reason
      }
    }
  } catch (e) {
    return refuse(messageOf(e))
  }
}

export { montage }
