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
  JumpFileRef,
  JumpsFile,
  Manifest,
  ManifestFile,
  ManifestJump,
  ManifestPassenger,
  ManifestPublish,
  ManifestStatus,
  SystemStatus,
  TaskState,
  TaskStatus,
  TheoryOverride,
  TheoryOverrides,
  TheoryVideoWithSource
} from './types'

export {
  jumpFileRefSchema,
  jumpsFileSchema,
  manifestFileSchema,
  manifestJumpSchema,
  manifestSchema,
  manifestStatusSchema,
  passengerSchema,
  publishSchema
} from './types'

export { reclusterJumps, shiftFiles } from './clustering'
export {
  buildJumpBaseName,
  formatCaptureTime,
  hasCompletePassenger,
  mergeJumps,
  moveFilesBetweenJumps,
  reorderFilesInJump
} from './workspace'
export { loadManifest, normalizeManifest, saveManifest } from './manifest'
export { publishJump } from './publish'
export type { DsmConfig, PublishArgs } from './publish'
export { clearNasSession, loadNasSession, saveNasSession, updateDefaultFolder } from './nas'
export type { NasSession } from './nas'
export { computeFileId, ensureManifestFileIds } from './fileId'
export { writeStatus, scheduleIdle } from './status'
export {
  checkExiftool,
  findMediaFiles,
  formatTimestamp,
  getExtension,
  getExtensionSafe,
  getManifestPath,
  getOutputDir,
  getStatusDir,
  hasCommand,
  isCliModule,
  isMediaFile,
  isPhotoFile,
  isVideoFile,
  parseExiftoolCsv,
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

export { watcher } from './watcher'
export type { WatcherOptions } from './watcher'

export { simulateCameras } from './simulate'
export type { SimulateOptions } from './simulate'

export { testPipeline } from './test-pipeline'
export type { TestOptions, TestResult } from './test-pipeline'
