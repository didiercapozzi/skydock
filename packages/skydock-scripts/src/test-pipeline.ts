import * as fs from 'node:fs'
import * as path from 'node:path'
import { countFiles } from './lib/fs'
import { isCliModule } from './utils'

type TestOptions = {
  camDirs?: string[]
  numFiles?: number
  outputDir?: string
  clean?: boolean
}

type TestResult = {
  passed: number
  failed: number
}

const assertDirExists = (dirPath: string, label: string, result: TestResult): void => {
  if (fs.existsSync(dirPath)) {
    console.log(`  PASS: ${label}`)
    result.passed++
  } else {
    console.log(`  FAIL: ${label}`)
    result.failed++
  }
}

const testPipeline = async (options?: TestOptions): Promise<TestResult> => {
  const projectRoot = path.resolve(new URL(import.meta.url).pathname, '..', '..', '..')
  const simBase = options?.outputDir || path.join(projectRoot, '.sim')
  const outputDir = path.join(projectRoot, 'output')
  const numFiles = options?.numFiles ?? 8
  const clean = options?.clean ?? false
  const result: TestResult = { passed: 0, failed: 0 }

  if (clean) {
    fs.rmSync(simBase, { recursive: true, force: true })
    fs.rmSync(outputDir, { recursive: true, force: true })
  }

  let cameraDirs = options?.camDirs
  if (!cameraDirs || cameraDirs.length === 0) {
    console.log('[Test] Generating simulated cameras...')
    const { simulateCameras } = await import('./simulate.js')
    await simulateCameras({ outputDir: simBase, clean: true, numFiles })
    cameraDirs = [path.join(simBase, 'camera1'), path.join(simBase, 'camera2')]
  }

  fs.mkdirSync(outputDir, { recursive: true })
  process.env.SKYDOCK_OUTPUT_DIR = outputDir

  console.log('')
  console.log('============================================================')
  console.log('    SkyDock Test')
  console.log('============================================================')
  console.log('')

  console.log('[Test] Processing cameras...')
  const { processMedia } = await import('./process.js')
  processMedia({ cameraDirs, outputDir })

  console.log('')
  console.log('------------------------------------------------------------')
  console.log('Verifying output...')
  console.log('')

  const today = new Date().toISOString().split('T')[0]
  assertDirExists(path.join(outputDir, 'original_files'), 'Output directory exists', result)
  assertDirExists(
    path.join(outputDir, 'original_files', today),
    "Today's date folder exists",
    result
  )

  const originalCount = countFiles(path.join(outputDir, 'original_files'))
  if (originalCount > 0) {
    console.log(`  PASS: Original files copied (${originalCount} files)`)
    result.passed++
  } else {
    console.log('  FAIL: No original files found')
    result.failed++
  }

  console.log('')
  console.log('------------------------------------------------------------')
  console.log('Testing deduplication (run again)...')
  console.log('')

  processMedia({ cameraDirs, outputDir })

  const newOriginalCount = countFiles(path.join(outputDir, 'original_files'))
  if (newOriginalCount === originalCount) {
    console.log('  PASS: Deduplication works (no new files copied)')
    result.passed++
  } else {
    console.log('  FAIL: Deduplication failed (files were copied again)')
    result.failed++
  }

  console.log('')
  console.log('============================================================')
  console.log(`    ${result.passed} passed, ${result.failed} failed`)
  console.log('============================================================')

  return result
}

if (isCliModule('test-pipeline')) {
  const args = process.argv.slice(2)
  const options: TestOptions = {
    clean: args.includes('--clean')
  }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cam-dir' && args[i + 1]) {
      if (!options.camDirs) options.camDirs = []
      options.camDirs.push(args[i + 1])
      i++
    }
    if (args[i] === '--num-files' && args[i + 1]) {
      options.numFiles = parseInt(args[i + 1], 10)
      i++
    }
  }

  testPipeline(options).then((result) => {
    process.exit(result.failed > 0 ? 1 : 0)
  })
}

export { testPipeline }
export type { TestOptions, TestResult }
