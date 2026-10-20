import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { stampOf } from './lib/clock'
import { pathExists, sameBytes } from './lib/fs'
import { editNameOf } from './montageNames'

const HISTORY = '.projects'

const keptProjectsDir = (outputDir: string) => join(outputDir, HISTORY)

const keepEdit = async (outputDir: string, dir: string, baseName: string, at = new Date()) => {
  const edit = join(dir, editNameOf(baseName))
  if (!(await pathExists(edit))) return null
  const folder = join(keptProjectsDir(outputDir), basename(dir))
  await mkdir(folder, { recursive: true })
  const ending = '.edit.json'
  const newest = (await readdir(folder))
    .filter((entry) => entry.startsWith(`${baseName}-`) && entry.endsWith(ending))
    .sort()
    .at(-1)
  if (newest && (await sameBytes(edit, join(folder, newest)))) return null
  const target = join(folder, `${baseName}-${stampOf(at)}${ending}`)
  await copyFile(edit, target)
  return target
}

const setEditAside = async (outputDir: string, editPath: string, at = new Date()) => {
  const folder = join(keptProjectsDir(outputDir), basename(dirname(editPath)))
  await mkdir(folder, { recursive: true })
  const name = `${basename(editPath, '.edit.json')}-${stampOf(at)}.unreadable.json`
  await copyFile(editPath, join(folder, name))
  await rm(editPath, { force: true })
  return join(HISTORY, basename(folder), name)
}

export { keepEdit, keptProjectsDir, setEditAside }
