import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { stampOf } from './lib/clock'
import { pathExists, sameBytes } from './lib/fs'

const HISTORY = '.projects'

const keptProjectsDir = (outputDir: string) => join(outputDir, HISTORY)

const keepProject = async (outputDir: string, dir: string, baseName: string, at = new Date()) => {
  const project = join(dir, `${baseName}.kdenlive`)
  if (!(await pathExists(project))) return null
  const folder = join(keptProjectsDir(outputDir), basename(dir))
  await mkdir(folder, { recursive: true })
  const newest = (await readdir(folder))
    .filter((entry) => entry.endsWith('.kdenlive'))
    .sort()
    .at(-1)
  if (newest && (await sameBytes(project, join(folder, newest)))) return null
  const target = join(folder, `${baseName}-${stampOf(at)}.kdenlive`)
  await copyFile(project, target)
  return target
}

export { keepProject, keptProjectsDir }
