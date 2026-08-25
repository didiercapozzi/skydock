import type { Route } from './+types/api.jump'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { getOutputDirPath } from '../lib/scanner.server'

const sanitizeName = (name: string): string => {
  return name
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData()
  const formAction = String(formData.get('action') ?? '')

  if (formAction === 'rename') {
    const date = String(formData.get('date') ?? '')
    const jumpDir = String(formData.get('jumpDir') ?? '')
    const newName = String(formData.get('newName') ?? '')

    if (!date || !jumpDir) {
      return { ok: false, error: 'Missing date or jumpDir' }
    }

    const outputDir = getOutputDirPath()
    const oldPath = path.join(outputDir, date, jumpDir)
    if (!fs.existsSync(oldPath)) {
      return { ok: false, error: 'Jump directory not found' }
    }

    const match = jumpDir.match(/^Jump_(\d+)(?:_(.+))?$/)
    if (!match) {
      return { ok: false, error: 'Invalid jump directory format' }
    }

    const num = match[1]
    const sanitized = newName ? sanitizeName(newName) : null
    const newDirName = sanitized ? `Jump_${num}_${sanitized}` : `Jump_${num}`
    const newPath = path.join(outputDir, date, newDirName)

    if (oldPath !== newPath && fs.existsSync(newPath)) {
      return { ok: false, error: 'A jump with that name already exists' }
    }

    if (oldPath !== newPath) {
      fs.renameSync(oldPath, newPath)
    }

    return { ok: true, jumpDir: newDirName }
  }

  return { ok: false, error: 'Invalid action' }
}

export { action }
