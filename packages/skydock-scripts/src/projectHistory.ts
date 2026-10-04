import * as fs from 'node:fs'
import * as path from 'node:path'
import { stampOf } from './lib/clock'

const HISTORY = '.projects'

const keptProjectsDir = (outputDir: string) => path.join(outputDir, HISTORY)

const sameFile = (a: string, b: string) => {
  try {
    const left = fs.statSync(a)
    const right = fs.statSync(b)
    return left.size === right.size && fs.readFileSync(a).equals(fs.readFileSync(b))
  } catch {
    return false
  }
}

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
