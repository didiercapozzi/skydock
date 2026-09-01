import * as fs from 'node:fs'
import * as path from 'node:path'
import { MEDIA_EXTENSIONS } from './constants'
import { getOutputDir } from './utils'

type WatcherOptions = {
  camDirs?: string[]
  testMode?: boolean
  runOnce?: boolean
  outputDir?: string
}

const MEDIA_EXTENSIONS_SET = new Set(MEDIA_EXTENSIONS.map((e) => e.toLowerCase()))

const hasMediaFiles = (dir: string): boolean => {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const ext = path.extname(entry.name).slice(1).toLowerCase()
      if (MEDIA_EXTENSIONS_SET.has(ext)) return true
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (hasMediaFiles(path.join(dir, entry.name))) return true
      }
    }
  } catch {}
  return false
}

const findCameraRoot = (startDir: string, baseDir: string): string => {
  let root = startDir
  while (true) {
    const parent = path.dirname(root)
    if (parent === baseDir || parent === '/') break
    if (hasMediaFiles(parent)) {
      root = parent
    } else {
      break
    }
  }
  return root
}

const findCamerasInDir = (base: string): string[] => {
  const cameras: string[] = []

  const search = (dir: string): void => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const fullPath = path.join(dir, entry.name)
        if (hasMediaFiles(fullPath)) {
          const root = findCameraRoot(fullPath, base)
          if (!cameras.includes(root)) cameras.push(root)
        }
        search(fullPath)
      }
    } catch {}
  }

  search(base)
  return cameras
}

const resolveCameras = (camDirs?: string[]): string[] => {
  if (camDirs && camDirs.length > 0) {
    const existing = camDirs.filter((d) => fs.existsSync(d))
    if (existing.length > 0) return existing
  }

  const bases = [
    '/media/skydock',
    `/media/${process.env.USER || 'root'}`,
    '/media',
    '/mnt',
    `/run/media/${process.env.USER || 'root'}`
  ]

  for (const base of bases) {
    if (!fs.existsSync(base)) continue
    const cameras = findCamerasInDir(base)
    if (cameras.length > 0) return cameras
  }

  return []
}

const runPipeline = async (cameras: string[], outputDir: string): Promise<void> => {
  const { processMedia } = await import('./process.js')
  const { scanMedia } = await import('./scan.js')
  const { generateProxies } = await import('./proxies.js')

  processMedia({ cameraDirs: cameras, outputDir })
  await scanMedia({ outputDir })
  generateProxies({ outputDir }).catch(console.error)
}

const watcher = async (options?: WatcherOptions): Promise<void> => {
  const testMode = options?.testMode ?? false
  const runOnce = options?.runOnce ?? false
  const camDirs = options?.camDirs
  const outputDir = options?.outputDir || getOutputDir()

  if (testMode) {
    const projectRoot = path.resolve(new URL(import.meta.url).pathname, '..', '..', '..')
    const simBase = path.join(projectRoot, '.sim')

    if (!camDirs || camDirs.length === 0) {
      console.log('[Watcher] Test mode: generating simulated cameras...')
      const { simulateCameras } = await import('./simulate.js')
      await simulateCameras({ outputDir: simBase, clean: true })
      const cameras = [path.join(simBase, 'camera1'), path.join(simBase, 'camera2')]
      await runPipeline(cameras, outputDir)
    } else {
      await runPipeline(camDirs, outputDir)
    }

    if (!runOnce) {
      while (true) {
        await new Promise((r) => setTimeout(r, 8000))
        if (camDirs) await runPipeline(camDirs, outputDir)
      }
    }

    return
  }

  console.log('[Watcher] Daemon active. Waiting for camera connections...')

  while (true) {
    const cameras = resolveCameras(camDirs)
    if (cameras.length > 0) {
      await runPipeline(cameras, outputDir)
    }
    await new Promise((r) => setTimeout(r, 8000))
  }
}

const isCli =
  process.argv[1] &&
  (process.argv[1].endsWith('watcher.ts') || process.argv[1].endsWith('watcher.js'))

if (isCli) {
  const args = process.argv.slice(2)
  const options: WatcherOptions = {
    camDirs: [],
    testMode: args.includes('--test'),
    runOnce: args.includes('--once')
  }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cam-dir' && args[i + 1]) {
      options.camDirs!.push(args[i + 1])
      i++
    }
  }

  if (options.camDirs!.length === 0) options.camDirs = undefined

  watcher(options).catch(console.error)
}

export { watcher }
export type { WatcherOptions }
