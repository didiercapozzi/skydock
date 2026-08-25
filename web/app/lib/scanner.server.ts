import * as fs from 'node:fs'
import * as path from 'node:path'
import type { FileEntry, Jump, DayGroup, TheoryOverrides, TheoryVideoWithSource } from './types'

const getOutputDir = (): string => {
  if (process.env.SKYDOCK_OUTPUT_DIR) {
    return process.env.SKYDOCK_OUTPUT_DIR
  }
  const workspace = process.env.SKYDOCK_WORKSPACE ?? process.cwd()
  return path.join(workspace, 'output')
}

const OVERRIDES_FILE = '.theory_overrides.json'

const loadOverrides = (outputDir: string): TheoryOverrides => {
  const filePath = path.join(outputDir, OVERRIDES_FILE)
  if (!fs.existsSync(filePath)) return {}
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as TheoryOverrides
  } catch {
    return {}
  }
}

export const saveOverrides = (outputDir: string, overrides: TheoryOverrides): void => {
  const filePath = path.join(outputDir, OVERRIDES_FILE)
  fs.writeFileSync(filePath, JSON.stringify(overrides, null, 2))
}

const isCopiedFromLibrary = (name: string): boolean => /^theory_\d{8}_\d{6}/.test(name)

const scanFiles = (dirPath: string, overrides: TheoryOverrides): FileEntry[] => {
  if (!fs.existsSync(dirPath)) return []
  return fs
    .readdirSync(dirPath)
    .filter((f) => fs.statSync(path.join(dirPath, f)).isFile())
    .map((name) => {
      const filePath = path.join(dirPath, name)
      const stat = fs.statSync(filePath)
      const isTheory = overrides[filePath] !== undefined
      return {
        name,
        path: filePath,
        size: stat.size,
        isTheory,
        copiedFromLibrary: isCopiedFromLibrary(name),
        mtime: Math.floor(stat.mtimeMs / 1000)
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

const parseJumpDir = (
  dirName: string,
  jumpPath: string
): { name: string | null; displayName: string; num: number } => {
  const match = dirName.match(/^Jump_(\d+)(?:_(.+))?$/)
  if (match) {
    const num = parseInt(match[1], 10)
    const rawName = match[2] ?? null
    const name = rawName ? rawName.replace(/_/g, ' ') : null
    return { name, displayName: `Jump ${num}`, num }
  }

  const numFile = path.join(jumpPath, '.jump_number')
  let num = 0
  if (fs.existsSync(numFile)) {
    try {
      num = parseInt(fs.readFileSync(numFile, 'utf-8').trim(), 10)
    } catch {
      num = 0
    }
  }

  return { name: dirName.replace(/_/g, ' '), displayName: dirName.replace(/_/g, ' '), num }
}

const buildJump = (
  date: string,
  dirName: string,
  jumpPath: string,
  overrides: TheoryOverrides
): Jump => {
  const { name, displayName, num } = parseJumpDir(dirName, jumpPath)
  const allPhotos = scanFiles(path.join(jumpPath, 'photos'), overrides)
  const allVideos = scanFiles(path.join(jumpPath, 'videos'), overrides)

  const totalSize =
    allPhotos.reduce((s, f) => s + f.size, 0) + allVideos.reduce((s, f) => s + f.size, 0)

  const videoTimes = allVideos.map((f) => f.mtime).filter((t) => t > 0)
  const startedAt = videoTimes.length > 0 ? Math.min(...videoTimes) : 0

  return {
    id: `${date}/${dirName}`,
    date,
    name,
    displayName,
    num,
    photoCount: allPhotos.length,
    videoCount: allVideos.length,
    theoryPhotoCount: 0,
    theoryVideoCount: 0,
    jumpPhotos: allPhotos,
    jumpVideos: allVideos,
    theoryPhotos: [],
    theoryVideos: [],
    totalSize,
    startedAt
  }
}

export const scanLibrary = (outputDir: string): TheoryVideoWithSource[] => {
  const overrides = loadOverrides(outputDir)
  const result: TheoryVideoWithSource[] = []

  for (const [filePath, override] of Object.entries(overrides)) {
    if (!fs.existsSync(filePath)) continue
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) continue

    const name = path.basename(filePath)
    result.push({
      name,
      path: filePath,
      size: stat.size,
      isTheory: true,
      copiedFromLibrary: false,
      mtime: Math.floor(stat.mtimeMs / 1000),
      jumpName: '',
      passengerName: null,
      jumpDate: override.sourceDate,
      jumpId: ''
    })
  }

  return result.sort((a, b) => a.name.localeCompare(b.name))
}

export const scanOutput = (): { days: DayGroup[]; libraryFiles: TheoryVideoWithSource[] } => {
  const outputDir = getOutputDir()
  if (!fs.existsSync(outputDir)) return { days: [], libraryFiles: [] }

  const libraryFiles = scanLibrary(outputDir)

  const dateDirs = fs
    .readdirSync(outputDir)
    .filter((d) => {
      const full = path.join(outputDir, d)
      return fs.statSync(full).isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d)
    })
    .sort()
    .reverse()

  const days = dateDirs.map((date) => {
    const datePath = path.join(outputDir, date)
    const jumpDirs = fs
      .readdirSync(datePath)
      .filter((d) => {
        const full = path.join(datePath, d)
        return fs.statSync(full).isDirectory() && d.startsWith('Jump_')
      })
      .sort()

    const overrides = loadOverrides(outputDir)
    const jumps: Jump[] = jumpDirs.map((dirName) =>
      buildJump(date, dirName, path.join(datePath, dirName), overrides)
    )

    const totalPhotos = jumps.reduce((s, j) => s + j.photoCount + j.theoryPhotoCount, 0)
    const totalVideos = jumps.reduce((s, j) => s + j.videoCount + j.theoryVideoCount, 0)

    return { date, jumps, totalPhotos, totalVideos }
  })

  return { days, libraryFiles }
}

export const getJump = (date: string, jumpDir: string): Jump | null => {
  const outputDir = getOutputDir()
  const jumpPath = path.join(outputDir, date, jumpDir)
  if (!fs.existsSync(jumpPath)) return null
  const overrides = loadOverrides(outputDir)
  return buildJump(date, jumpDir, jumpPath, overrides)
}

export const getOutputDirPath = (): string => getOutputDir()
