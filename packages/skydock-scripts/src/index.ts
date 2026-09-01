export {
  DEFAULT_OUTPUT_DIR,
  JUMP_GAP_SECONDS,
  MEDIA_EXTENSIONS,
  MEDIA_EXTENSIONS_SET,
  PHOTO_EXTENSIONS,
  PHOTO_EXTENSIONS_SET,
  VIDEO_EXTENSIONS,
  VIDEO_EXTENSIONS_SET
} from './constants'

export type {
  DayGroup,
  FileEntry,
  Jump,
  Manifest,
  ManifestFile,
  ManifestJump,
  ManifestStatus,
  SystemStatus,
  TaskState,
  TaskStatus,
  TheoryOverride,
  TheoryOverrides,
  TheoryVideoWithSource
} from './types'

export {
  manifestFileSchema,
  manifestJumpSchema,
  manifestSchema,
  manifestStatusSchema
} from './types'

export { reclusterJumps, shiftFiles } from './clustering'
export { loadManifest, normalizeManifest, saveManifest } from './manifest'
export { computeFileId, ensureManifestFileIds } from './fileId'
export { writeStatus, scheduleIdle } from './status'
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
} from './utils'

export { processMedia } from './process'
export type { ProcessOptions } from './process'

export { scanMedia } from './scan'
export type { ScanResult } from './scan'

export { executeMedia } from './execute'
export type { ExecuteOptions, ExecuteResult } from './execute'

export { generateProxies } from './proxies'
export type { ProxyOptions } from './proxies'

export { watcher } from './watcher'
export type { WatcherOptions } from './watcher'

export { simulateCameras } from './simulate'
export type { SimulateOptions } from './simulate'

export { testPipeline } from './test-pipeline'
export type { TestOptions, TestResult } from './test-pipeline'
