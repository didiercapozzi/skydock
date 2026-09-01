import * as path from 'node:path'
import { VIDEO_EXTENSIONS_SET, PHOTO_EXTENSIONS_SET, MEDIA_EXTENSIONS_SET } from './constants'
import type { ManifestFile } from './types'

const sanitizeLabel = (label: string): string => label.replace(/[^a-zA-Z0-9._-]/g, '_')

const getExtension = (filePath: string): string => path.extname(filePath).slice(1).toLowerCase()

const isVideoFile = (filePath: string): boolean => VIDEO_EXTENSIONS_SET.has(getExtension(filePath))

const isPhotoFile = (filePath: string): boolean => PHOTO_EXTENSIONS_SET.has(getExtension(filePath))

const isMediaFile = (filePath: string): boolean => MEDIA_EXTENSIONS_SET.has(getExtension(filePath))

const getOutputDir = (): string => process.env.SKYDOCK_OUTPUT_DIR || '/workspace/output'

const getManifestPath = (outputDir?: string): string => path.join(outputDir || getOutputDir(), 'manifest.json')

const getStatusDir = (outputDir?: string): string => path.join(outputDir || getOutputDir(), '.status')

const getCacheDir = (outputDir?: string): string => path.join(outputDir || getOutputDir(), '.cache')

const getThumbDir = (outputDir?: string): string => path.join(getCacheDir(outputDir), 'thumbs')

const getProxyDir = (outputDir?: string): string => path.join(getCacheDir(outputDir), 'proxies')

const sortFilesByMtime = (files: ManifestFile[]): ManifestFile[] =>
  [...files].sort((a, b) => a.mtime - b.mtime)

const getExtensionSafe = (filePath: string): string => {
  const ext = getExtension(filePath)
  return ext || 'unknown'
}

const formatTimestamp = (epoch: number): string => {
  const date = new Date(epoch * 1000)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${y}${m}${d}_${h}${min}${s}`
}

const toISOString = (date?: Date): string => (date || new Date()).toISOString()

export {
  formatTimestamp,
  getCacheDir,
  getExtension,
  getExtensionSafe,
  getManifestPath,
  getOutputDir,
  getProxyDir,
  getStatusDir,
  getThumbDir,
  isMediaFile,
  isPhotoFile,
  isVideoFile,
  sanitizeLabel,
  sortFilesByMtime,
  toISOString
}
