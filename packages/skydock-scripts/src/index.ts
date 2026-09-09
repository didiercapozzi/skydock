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
  TaskStatus
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
  buildFsTime,
  buildJumpBaseName,
  formatCaptureTime,
  hasCompletePassenger,
  makeFileName,
  mergeJumps,
  moveFilesBetweenJumps,
  reorderFilesInJump
} from './workspace'
export { loadManifest, normalizeManifest, saveManifest } from './manifest'
export { publishJump, uploadFile } from './publish'
export type { PublishArgs, UploadProgress } from './publish'
export {
  clearUploadProgress,
  getUploadProgressPath,
  readUploadProgress,
  uploadProgressStateSchema,
  writeUploadProgress
} from './uploadProgress'
export type { UploadProgressState } from './uploadProgress'
export {
  clearNasSession,
  createShareLink,
  dsmConfigSchema,
  dsmCreateFolder,
  dsmFetch,
  dsmListFolder,
  dsmLogin,
  dsmLogout,
  dsmResponseSchema,
  dsmUrl,
  dsmValidateSession,
  listNasFolder,
  loadNasSession,
  loginWithSession,
  normalizeNasPath,
  saveNasSession,
  updateDefaultFolder
} from './nas'
export type { DsmAuth, DsmConfig, NasSession } from './nas'
export { computeFileId, ensureManifestFileIds } from './fileId'
export { writeStatus, scheduleIdle } from './status'
export {
  checkExiftool,
  countFiles,
  daySchema,
  dayToIso,
  DEFAULT_MAX_FIND_DEPTH,
  fileMatchesExisting,
  findMediaFiles,
  formatDay,
  formatTodayDeCh,
  formatTimestamp,
  getExtension,
  getExtensionSafe,
  getManifestPath,
  getOutputDir,
  getStatusDir,
  hasCommand,
  hasMediaFiles,
  isCliModule,
  isoToDay,
  isMediaFile,
  isPhotoFile,
  isVideoFile,
  parseDayEpoch,
  parseExiftoolCsv,
  sanitizeLabel,
  sortFilesByMtime,
  toISOString,
  walkFiles
} from './utils'
export { buildExifMap } from './lib/exif'
export { withStatus } from './lib/cli'

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
