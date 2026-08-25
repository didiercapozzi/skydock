import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { getOutputDirPath } from '../lib/scanner.server'

const SCRIPTS_DIR = path.join(process.cwd(), '..', 'scripts')

const generateDummyMp4 = (outputPath: string): boolean => {
  try {
    execSync(
      `ffmpeg -y -loglevel error -f lavfi -i "testsrc=duration=2:size=1920x1080:rate=30" -f lavfi -i "sine=frequency=440:duration=2" -c:v libx264 -preset ultrafast -tune zerolatency -c:a aac -shortest "${outputPath}"`,
      { timeout: 15_000 }
    )
    return true
  } catch {
    return false
  }
}

const getNextFileNum = (dir: string): number => {
  if (!fs.existsSync(dir)) return 1
  const nums = fs
    .readdirSync(dir)
    .map((f) => {
      const m = f.match(/^DJI_(\d+)/)
      return m ? parseInt(m[1], 10) : 0
    })
    .filter((n) => n > 0)
  return nums.length > 0 ? Math.max(...nums) + 1 : 1
}

const getLatestMtime = (dir: string): number => {
  if (!fs.existsSync(dir)) return 0
  const files = fs.readdirSync(dir)
  if (files.length === 0) return 0
  let max = 0
  for (const f of files) {
    try {
      const s = fs.statSync(path.join(dir, f))
      const m = Math.floor(s.mtimeMs / 1000)
      if (m > max) max = m
    } catch {
      // skip
    }
  }
  return max
}

const addJumpFiles = (simBase: string): { ok: boolean; error?: string } => {
  const photoDir = path.join(simBase, 'photo_cam')
  const videoDir = path.join(simBase, 'video_cam')
  fs.mkdirSync(photoDir, { recursive: true })
  fs.mkdirSync(videoDir, { recursive: true })

  const latestPhoto = getLatestMtime(photoDir)
  const latestVideo = getLatestMtime(videoDir)
  const baseEpoch = Math.max(latestPhoto, latestVideo, Math.floor(Date.now() / 1000) - 60) + 960

  let photoNum = getNextFileNum(photoDir)
  for (let i = 0; i < 2; i++) {
    const epoch = baseEpoch + i * 30
    const filename = `DJI_${String(photoNum).padStart(4, '0')}.MP4`
    photoNum++
    const filepath = path.join(photoDir, filename)
    if (generateDummyMp4(filepath)) {
      fs.utimesSync(filepath, new Date(epoch * 1000), new Date(epoch * 1000))
    }
  }

  let videoNum = getNextFileNum(videoDir)
  for (let i = 0; i < 2; i++) {
    const epoch = baseEpoch + i * 30 + 5
    const filename = `DJI_${String(videoNum).padStart(4, '0')}.MP4`
    videoNum++
    const filepath = path.join(videoDir, filename)
    if (generateDummyMp4(filepath)) {
      fs.utimesSync(filepath, new Date(epoch * 1000), new Date(epoch * 1000))
    }
  }

  return { ok: true }
}

const action = async ({ request }: { request: Request }) => {
  if (process.env.NODE_ENV === 'production') {
    return { ok: false, error: 'Simulation is only available in development' }
  }

  const formData = await request.formData()
  const formAction = String(formData.get('action') ?? '')

  const outputDir = getOutputDirPath()
  const simBase = path.join(process.cwd(), '..', '.sim')
  const scanScript = path.join(SCRIPTS_DIR, 'scan_media.sh')
  const photoDir = path.join(simBase, 'photo_cam')
  const videoDir = path.join(simBase, 'video_cam')

  if (formAction === 'add-jump') {
    const result = addJumpFiles(simBase)
    if (!result.ok) return result

    // Phase 1: Scan new files into manifest
    try {
      execSync(
        `SKYDOCK_OUTPUT_DIR="${outputDir}" "${scanScript}" "${photoDir}" "${videoDir}" 2>&1`,
        { timeout: 30_000 }
      )
    } catch (e) {
      return { ok: false, error: `Scan failed: ${e instanceof Error ? e.message : String(e)}` }
    }
    return { ok: true }
  }

  // Default action: simulate full load
  try {
    execSync(
      `"${path.join(SCRIPTS_DIR, 'simulate_cameras.sh')}" --output "${simBase}" --jumps 2 --clean`,
      { timeout: 30_000, stdio: 'pipe' }
    )
  } catch (e) {
    return { ok: false, error: `Simulation failed: ${e instanceof Error ? e.message : String(e)}` }
  }

  // Phase 1: Scan into manifest for user review
  try {
    execSync(
      `SKYDOCK_OUTPUT_DIR="${outputDir}" "${scanScript}" "${photoDir}" "${videoDir}"`,
      { timeout: 30_000, stdio: 'pipe' }
    )
  } catch (e) {
    return { ok: false, error: `Scan failed: ${e instanceof Error ? e.message : String(e)}` }
  }

  return { ok: true }
}

export { action }
