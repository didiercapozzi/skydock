export {
  DEFAULT_OUTPUT_DIR,
  GROUP_GAP_SECONDS,
  MEDIA_EXTENSIONS,
  MEDIA_EXTENSIONS_SET,
  PHOTO_EXTENSIONS,
  PHOTO_EXTENSIONS_SET,
  VIDEO_EXTENSIONS,
  VIDEO_EXTENSIONS_SET
} from './constants'

export type {
  Destination,
  GroupFileRef,
  GroupsFile,
  Manifest,
  ManifestFile,
  ManifestGroup,
  ManifestPassenger,
  ManifestPublish,
  ManifestStatus,
  SystemStatus,
  TaskState,
  TaskStatus
} from './types'

export {
  destinationCreationSchema,
  destinationSchema,
  destinationsSchema,
  groupFileRefSchema,
  groupsFileSchema,
  manifestFileSchema,
  manifestGroupSchema,
  manifestSchema,
  manifestStatusSchema,
  passengerSchema,
  publishSchema,
  systemStatusSchema,
  taskStateSchema,
  taskStatusSchema
} from './types'

export { groupFromFiles, reclusterGroups, regroupLooseFiles, shiftFiles } from './clustering'
export {
  buildFsTime,
  buildGroupBaseName,
  formatCaptureTime,
  hasCompletePassenger,
  makeFileName,
  mergeGroups,
  moveFilesBetweenGroups,
  reorderFilesInGroup,
  resolveDestinationPath
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
  decryptPasswordFromStorage,
  dsmConfigSchema,
  dsmCreateFolder,
  dsmEntryUrl,
  dsmFetch,
  dsmGetEncryptionInfo,
  dsmListFolder,
  dsmLogin,
  dsmLogout,
  dsmRequestUrl,
  dsmResponseSchema,
  dsmValidateSession,
  encryptPasswordForStorage,
  listNasFolder,
  loadNasSession,
  loginWithSession,
  normalizeNasPath,
  saveNasSession,
  tryAutoRefreshSession,
  updateDefaultFolder
} from './nas'
export type { DsmAuth, DsmConfig, NasSession } from './nas'
export { computeFileId, ensureManifestFileIds } from './fileId'
export { writeStatus, scheduleIdle } from './status'
export {
  checkExiftool,
  countFiles,
  dayToIso,
  fileMatchesExisting,
  findMediaFiles,
  formatDay,
  formatTodayDeCh,
  getExtension,
  getManifestPath,
  getOutputDir,
  getStatusDir,
  hasCommand,
  hasMediaFiles,
  isCliModule,
  isoToDay,
  isVideoFile,
  parseDayEpoch,
  parseExiftoolCsv,
  sortFilesByMtime,
  toISOString,
  walkFiles,
  withRetry
} from './utils'
export { buildExifMap } from './lib/exif'
export { writeJsonAtomic } from './lib/fs'

export { processMedia } from './process'
export type { ProcessOptions } from './process'

export { scanMedia } from './scan'
export type { ScanResult } from './scan'

export { executeMedia, getGroupProcessedDir } from './execute'
export type { ExecuteOptions, ExecuteResult } from './execute'

export { watcher } from './watcher'
export type { WatcherOptions } from './watcher'

export { simulateCameras } from './simulate'
export type { SimulateOptions } from './simulate'

export { testPipeline } from './test-pipeline'
export type { TestOptions, TestResult } from './test-pipeline'
