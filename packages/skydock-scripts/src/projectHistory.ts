import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { stampOf } from './lib/clock'
import { pathExists, sameBytes } from './lib/fs'

const HISTORY = '.projects'

const EDITS = ['.kdenlive', '.edit.json'] as const

const keptProjectsDir = (outputDir: string) => join(outputDir, HISTORY)

const keepOne = async (folder: string, dir: string, baseName: string, ending: string, at: Date) => {
  const project = join(dir, `${baseName}${ending}`)
  if (!(await pathExists(project))) return null
  await mkdir(folder, { recursive: true })
  const newest = (await readdir(folder))
    .filter((entry) => entry.endsWith(ending))
    .sort()
    .at(-1)
  if (newest && (await sameBytes(project, join(folder, newest)))) return null
  const target = join(folder, `${baseName}-${stampOf(at)}${ending}`)
  await copyFile(project, target)
  return target
}

const keepProject = async (outputDir: string, dir: string, baseName: string, at = new Date()) => {
  const folder = join(keptProjectsDir(outputDir), basename(dir))
  const kept = []
  for (const ending of EDITS) kept.push(await keepOne(folder, dir, baseName, ending, at))
  return kept.find((target) => target !== null) ?? null
}

export { keepProject, keptProjectsDir }
