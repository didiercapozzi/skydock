import * as fs from 'node:fs'
import * as path from 'node:path'
import { getGroupProcessedDir, isTandem, passengerOf, saveManifest } from '@skydock/scripts'
import { openInEditor } from '../../../../packages/skydock-scripts/src/editor'
import { createMontageProject } from '../../../../packages/skydock-scripts/src/montage'
import { getCutProxyDir } from '../../../../packages/skydock-scripts/src/proxy'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* A processed tandem gets an editing project with its clips already on the timeline, and the
   project is opened in the same press: it exists to be edited (RULES, Montage). */
const montage: Intent = async ({ data, manifest, manifestPath, outputDir, refuse }) => {
  const group = manifest.groups.find((g) => g.id === data.groupId)
  if (!group) return refuse('Group not found.')
  if (!isTandem(group)) return refuse('Only a tandem gets a montage — give it a passenger first.')
  if (!group.processed) return refuse('Process this tandem before making its montage.')
  const { dir: groupDir, baseName } = getGroupProcessedDir(outputDir, group)
  if (!fs.existsSync(groupDir)) return refuse('Processed folder not found. Process it again.')
  /* an edit someone has been working on is never overwritten (RULES, Montage) */
  if (fs.readdirSync(groupDir).some((f) => f.endsWith('.kdenlive')))
    return refuse('This tandem already has a project — open it in kdenlive.')
  try {
    /* the processed copies are already renamed and cropped — the timeline lays them out */
    const videos = fs
      .readdirSync(path.join(groupDir, 'videos'), { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => path.join(groupDir, 'videos', e.name))
      .sort()
    /* which file each copy was made from, by the name the copy carries */
    const copies = new Map(
      group.files.flatMap((f) => (f.processed ? [[path.basename(f.processed.path), f]] : []))
    )
    const made = createMontageProject({
      groupDir,
      outputDir,
      baseName,
      title: passengerOf(group).trim() || group.label,
      template: data.template,
      /* Each copy with the proxy processing cut for it, when it managed to make one, and with what
         the jump in it was measured at: a clip that holds a jump is laid cut at its moments (RULES,
         Montage), and the moments belong to the file it was copied from. */
      clips: videos.map((file) => {
        const proxy = path.join(getCutProxyDir(outputDir, group.id), `${path.parse(file).name}.mp4`)
        const measured = copies.get(path.basename(file))
        return {
          path: file,
          ...(fs.existsSync(proxy) ? { proxy } : {}),
          moments: measured?.moments,
          cropStart: measured?.cropStart
        }
      })
    })
    group.montage = {
      projectPath: made.projectPath,
      filmPath: made.filmPath,
      template: made.template,
      clips: made.clips,
      at: Math.floor(Date.now() / 1000)
    }
    saveManifest(manifestPath, manifest)
    const opened = await openInEditor(made.projectPath)
    return {
      ...boardAnswer(manifest),
      montage: {
        clips: made.clips,
        missingAssets: made.missingAssets,
        repositioned: made.repositioned,
        opened: opened.opened,
        openCommand: opened.command,
        openReason: opened.reason
      }
    }
  } catch (e) {
    return refuse(e instanceof Error ? e.message : String(e))
  }
}

export { montage }
