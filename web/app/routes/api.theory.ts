import type { Route } from './+types/api.theory'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { getOutputDirPath, saveOverrides } from '../lib/scanner.server'
import type { TheoryOverrides } from '../lib/types'

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

const getSourceDateFromPath = (filePath: string): string => {
  const parts = filePath.split(path.sep)
  for (const part of parts) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(part)) return part
  }
  return ''
}

const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData()
  const formAction = String(formData.get('action') ?? '')

  const outputDir = getOutputDirPath()
  const overrides = loadOverrides(outputDir)

  if (formAction === 'toggle') {
    const filePath = String(formData.get('filePath') ?? '')
    const isTheory = String(formData.get('isTheory') ?? '') === 'true'
    if (!filePath) return { ok: false, error: 'Missing filePath' }

    if (isTheory) {
      overrides[filePath] = {
        originalPath: filePath,
        sourceDate: getSourceDateFromPath(filePath)
      }
    } else {
      delete overrides[filePath]
    }

    saveOverrides(outputDir, overrides)
    return { ok: true }
  }

  if (formAction === 'copy-to-jump') {
    const theoryPath = String(formData.get('theoryPath') ?? '')
    const targetDate = String(formData.get('targetDate') ?? '')
    const targetJumpDir = String(formData.get('targetJumpDir') ?? '')

    if (!theoryPath || !targetDate || !targetJumpDir) {
      return { ok: false, error: 'Missing parameters' }
    }

    if (!fs.existsSync(theoryPath)) {
      return { ok: false, error: 'Source file not found' }
    }

    const sourceName = path.basename(theoryPath)
    const ext = path.extname(sourceName).toLowerCase()
    const isPhoto = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext)
    const targetSubdir = isPhoto ? 'photos' : 'videos'
    const targetDir = path.join(outputDir, targetDate, targetJumpDir, targetSubdir)
    if (!fs.existsSync(targetDir)) {
      return { ok: false, error: 'Target jump not found' }
    }

    const targetPath = path.join(targetDir, sourceName)

    if (fs.existsSync(targetPath)) {
      return { ok: true, message: 'File already exists' }
    }

    fs.copyFileSync(theoryPath, targetPath)
    return { ok: true }
  }

  if (formAction === 'apply') {
    const sourceJump = String(formData.get('sourceJump') ?? '')
    const sourceJumpDate = String(formData.get('sourceJumpDate') ?? '')
    if (!sourceJump || !sourceJumpDate) {
      return { ok: false, error: 'Missing source jump' }
    }

    const sourcePath = path.join(outputDir, sourceJumpDate, sourceJump)
    if (!fs.existsSync(sourcePath)) {
      return { ok: false, error: 'Source jump not found' }
    }

    const collectFiles = (dirPath: string): string[] => {
      if (!fs.existsSync(dirPath)) return []
      return fs
        .readdirSync(dirPath)
        .filter((f) => fs.statSync(path.join(dirPath, f)).isFile())
        .map((f) => path.join(dirPath, f))
    }

    const sourceFiles = collectFiles(path.join(sourcePath, 'photos')).concat(
      collectFiles(path.join(sourcePath, 'videos'))
    )

    const dateDirs = fs.readdirSync(outputDir).filter((d) => {
      const full = path.join(outputDir, d)
      return fs.statSync(full).isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d)
    })

    for (const date of dateDirs) {
      const datePath = path.join(outputDir, date)
      const jumpDirs = fs.readdirSync(datePath).filter((d) => {
        const full = path.join(datePath, d)
        return (
          fs.statSync(full).isDirectory() &&
          d.startsWith('Jump_') &&
          `${date}/${d}` !== `${sourceJumpDate}/${sourceJump}`
        )
      })

      for (const jumpDir of jumpDirs) {
        const jumpPhotos = collectFiles(path.join(datePath, jumpDir, 'photos'))
        const jumpVideos = collectFiles(path.join(datePath, jumpDir, 'videos'))
        const allJumpFiles = jumpPhotos.concat(jumpVideos)

        for (const sourceFile of sourceFiles) {
          const sourceName = path.basename(sourceFile)
          const matching = allJumpFiles.find((f) => path.basename(f) === sourceName)
          if (matching) {
            overrides[matching] = {
              originalPath: matching,
              sourceDate: getSourceDateFromPath(matching)
            }
          }
        }
      }
    }

    saveOverrides(outputDir, overrides)
    return { ok: true }
  }

  return { ok: false, error: 'Invalid action' }
}

export { action }
