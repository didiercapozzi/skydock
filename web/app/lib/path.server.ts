import * as fs from 'node:fs'
import * as path from 'node:path'
import { loadManifest, getOutputDir } from '@skydock/scripts'
import { jsonError } from './response.server'

const resolvePath = (rawPath: string | null, id: string | null): string | null => {
  if (rawPath) return path.resolve(rawPath)
  if (id) {
    const manifestPath = path.join(getOutputDir(), 'manifest.json')
    const manifest = loadManifest(manifestPath)
    if (!manifest) return null
    const f = manifest.files.find((x) => x.id === id)
    if (f) return path.resolve(f.path)
  }
  return null
}

type ValidateResult = { resolved: string } | { error: Response }

const resolveAndValidateFile = (rawPath: string | null, id: string | null): ValidateResult => {
  const resolved = resolvePath(rawPath, id)
  if (!resolved) return { error: jsonError('Missing path or id', 400) }

  const outputDir = getOutputDir()
  if (!resolved.startsWith(path.resolve(outputDir))) {
    if (!fs.existsSync(resolved)) return { error: jsonError('File not found', 404) }
  }

  if (!fs.existsSync(resolved)) return { error: jsonError('File not found', 404) }
  try {
    if (!fs.statSync(resolved).isFile()) return { error: jsonError('Not a file', 400) }
  } catch {
    return { error: jsonError('Not a file', 400) }
  }

  return { resolved }
}

export { resolvePath, resolveAndValidateFile }
