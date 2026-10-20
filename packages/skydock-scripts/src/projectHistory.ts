import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { stampOf } from './lib/clock'
import { pathExists, sameBytes } from './lib/fs'

const HISTORY = '.projects'

const EDITS = ['.kdenlive', '.edit.json'] as const

const keptProjectsDir = (outputDir: string) => join(outputDir, HISTORY)

const keepOne = async (folder: string, dir: string, stem: string, ending: string, at: Date) => {
  const project = join(dir, `${stem}${ending}`)
  if (!(await pathExists(project))) return null
  await mkdir(folder, { recursive: true })
  const newest = (await readdir(folder))
    .filter((entry) => entry.startsWith(`${stem}-`) && entry.endsWith(ending))
    .sort()
    .at(-1)
  if (newest && (await sameBytes(project, join(folder, newest)))) return null
  const target = join(folder, `${stem}-${stampOf(at)}${ending}`)
  await copyFile(project, target)
  return target
}

const keepProject = async (outputDir: string, dir: string, baseName: string, at = new Date()) => {
  const folder = join(keptProjectsDir(outputDir), basename(dir))
  const others = (await readdir(dir).catch(() => [] as string[])).filter(
    (entry) => entry.endsWith('.kdenlive') && entry !== `${baseName}.kdenlive`
  )
  const kept = []
  for (const ending of EDITS) kept.push(await keepOne(folder, dir, baseName, ending, at))
  for (const other of others)
    kept.push(await keepOne(folder, dir, other.slice(0, -'.kdenlive'.length), '.kdenlive', at))
  return kept.find((target) => target !== null) ?? null
}

const setEditAside = async (outputDir: string, editPath: string, at = new Date()) => {
  const folder = join(keptProjectsDir(outputDir), basename(dirname(editPath)))
  await mkdir(folder, { recursive: true })
  const name = `${basename(editPath, '.edit.json')}-${stampOf(at)}.unreadable.json`
  await copyFile(editPath, join(folder, name))
  await rm(editPath, { force: true })
  return join(HISTORY, basename(folder), name)
}

export { keepProject, keptProjectsDir, setEditAside }
