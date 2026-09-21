import * as fs from 'node:fs'
import * as path from 'node:path'

/* Every version of a passenger's editing project, kept aside.

   An edit is hours of somebody's work and the one thing of a tandem that cannot be made again. So
   before SkyDock does anything to a tandem that could stand between the person and that work —
   preparing it again, resetting it, deleting it — the project as it stands at that moment is copied
   in here, under the passenger's folder name and the moment it was kept.

   Nothing here is ever deleted, not even when the tandem is. A project is a few hundred kilobytes
   beside the gigabytes it describes, and the day somebody wants one back is the day it matters. */

const HISTORY = '.projects'

const keptProjectsDir = (outputDir: string) => path.join(outputDir, HISTORY)

/* the moment, as a name a folder can hold and a person can read: 2026-09-21T18-05-12 */
const stampOf = (at: Date) =>
  `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}T${String(at.getHours()).padStart(2, '0')}-${String(at.getMinutes()).padStart(2, '0')}-${String(at.getSeconds()).padStart(2, '0')}`

const sameFile = (a: string, b: string) => {
  try {
    const left = fs.statSync(a)
    const right = fs.statSync(b)
    return left.size === right.size && fs.readFileSync(a).equals(fs.readFileSync(b))
  } catch {
    return false
  }
}

/* What is kept is what changed: pressing the same button twice leaves one version, not two. */
const keepProject = (outputDir: string, dir: string, baseName: string, at = new Date()) => {
  const project = path.join(dir, `${baseName}.kdenlive`)
  if (!fs.existsSync(project)) return null
  const folder = path.join(keptProjectsDir(outputDir), path.basename(dir))
  fs.mkdirSync(folder, { recursive: true })
  const kept = fs
    .readdirSync(folder)
    .filter((entry) => entry.endsWith('.kdenlive'))
    .sort()
  const newest = kept[kept.length - 1]
  if (newest && sameFile(project, path.join(folder, newest))) return null
  const target = path.join(folder, `${baseName}-${stampOf(at)}.kdenlive`)
  fs.copyFileSync(project, target)
  return target
}

export { keepProject, keptProjectsDir }
