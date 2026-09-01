import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync } from 'node:child_process'

type SimulateOptions = {
  outputDir?: string
  clean?: boolean
  duration?: number
  numFiles?: number
  devData?: boolean
}

const hasCommand = (cmd: string): boolean => {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const createFile = (dir: string, name: string, epoch: number, duration: number): void => {
  const filePath = path.join(dir, name)
  const ext = path.extname(name).toLowerCase()

  if (ext === '.jpg' || ext === '.jpeg') {
    if (hasCommand('ffmpeg')) {
      try {
        execSync(`ffmpeg -y -loglevel error -f lavfi -i "testsrc=size=1920x1080:rate=1" -frames:v 1 "${filePath}"`, { stdio: 'ignore' })
      } catch {
        fs.writeFileSync(filePath, Buffer.alloc(30 * 1024))
      }
    } else {
      fs.writeFileSync(filePath, Buffer.alloc(30 * 1024))
    }
  } else {
    if (hasCommand('ffmpeg')) {
      try {
        execSync(
          `ffmpeg -y -loglevel error -f lavfi -i "testsrc=duration=${duration}:size=1920x1080:rate=30" -f lavfi -i "sine=frequency=440:duration=${duration}" -c:v libx264 -preset ultrafast -tune zerolatency -c:a aac -shortest "${filePath}"`,
          { stdio: 'ignore' }
        )
      } catch {
        fs.writeFileSync(filePath, Buffer.alloc(50 * 1024))
      }
    } else {
      fs.writeFileSync(filePath, Buffer.alloc(50 * 1024))
    }
  }

  const stat = fs.statSync(filePath)
  fs.utimesSync(filePath, stat.atime, new Date(epoch * 1000))
}

const simulateCameras = async (options?: SimulateOptions): Promise<void> => {
  const simBase = options?.outputDir || path.resolve(process.cwd(), '.sim')
  const clean = options?.clean ?? false
  const duration = options?.duration ?? 5
  const numFiles = options?.numFiles ?? 8
  const devData = options?.devData ?? false

  if (clean && fs.existsSync(simBase)) {
    fs.rmSync(simBase, { recursive: true, force: true })
  }

  const camera1Dir = path.join(simBase, 'camera1')
  const camera2Dir = path.join(simBase, 'camera2')
  fs.mkdirSync(camera1Dir, { recursive: true })
  fs.mkdirSync(camera2Dir, { recursive: true })

  if (devData) {
    const now = new Date()
    const day1Base = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3, 9, 0, 0).getTime() / 1000)
    const day2Base = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 10, 0, 0).getTime() / 1000)
    const offsetsDay1 = [0, 90, 180, 270, 360, 2760, 2850, 2940, 3030, 3120]
    const offsetsDay2 = [0, 90, 180, 270, 2970, 3060, 3150, 3240]
    let fileCounter = 0
    let idx = 0

    for (const off of offsetsDay1) {
      fileCounter++
      idx++
      const epoch = day1Base + off
      const ext = idx % 3 === 0 ? '.JPG' : '.MP4'
      const filename = `DJI_${String(fileCounter).padStart(4, '0')}${ext}`
      const targetDir = idx % 2 === 1 ? camera1Dir : camera2Dir
      createFile(targetDir, filename, epoch, duration)
    }

    for (const off of offsetsDay2) {
      fileCounter++
      idx++
      const epoch = day2Base + off
      const ext = idx % 3 === 0 ? '.JPG' : '.MP4'
      const filename = `DJI_${String(fileCounter).padStart(4, '0')}${ext}`
      const targetDir = idx % 2 === 1 ? camera1Dir : camera2Dir
      createFile(targetDir, filename, epoch, duration)
    }

    const d1 = new Date(day1Base * 1000).toISOString().split('T')[0]
    const d2 = new Date(day2Base * 1000).toISOString().split('T')[0]
    console.log(`[Sim] Created 18 files mixed JPG/MP4 (10 on ${d1} in 2 jumps, 8 on ${d2} in 2 jumps) under ${simBase}`)
    return
  }

  const baseEpoch = Math.floor(new Date().setHours(9, 0, 0, 0) / 1000)
  let fileCounter = 0

  for (let i = 0; i < numFiles; i++) {
    fileCounter++
    const epoch1 = baseEpoch + i * 30
    const filename1 = `DJI_${String(fileCounter).padStart(4, '0')}.MP4`
    createFile(camera1Dir, filename1, epoch1, duration)

    fileCounter++
    const epoch2 = baseEpoch + i * 30 + 15
    const filename2 = `DJI_${String(fileCounter).padStart(4, '0')}.MP4`
    createFile(camera2Dir, filename2, epoch2, duration)
  }

  console.log(`[Sim] Created ${numFiles} files in each camera under ${simBase}`)
}

const isCli = process.argv[1] && (
  process.argv[1].endsWith('simulate.ts') ||
  process.argv[1].endsWith('simulate.js')
)

if (isCli) {
  const args = process.argv.slice(2)
  const options: SimulateOptions = {
    clean: args.includes('--clean'),
    devData: args.includes('--dev-data')
  }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) { options.outputDir = args[i + 1]; i++ }
    if (args[i] === '--duration' && args[i + 1]) { options.duration = parseInt(args[i + 1], 10); i++ }
    if (args[i] === '--num-files' && args[i + 1]) { options.numFiles = parseInt(args[i + 1], 10); i++ }
  }

  simulateCameras(options).catch(console.error)
}

export { simulateCameras }
export type { SimulateOptions }
