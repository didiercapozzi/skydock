/* What the web app may import. Everything else in this package is internal to it — the tests reach
   into the modules directly, so this stays exactly as wide as the app needs. What shells out or
   reaches the filesystem behind a click — building proxies, uploading a tandem, importing a file,
   freeing, taking back — is imported by the routes straight from its module, so none of it can
   reach the browser bundle. */
import { boardAnswerSchema, importOutcomeSchema } from './boardAnswer'
import type { BoardAnswer, ImportOutcome, MontageNote, ScanResult, TandemFact } from './boardAnswer'
import {
  groupFromFiles,
  offGap,
  reclusterGroups,
  regroupLooseFiles,
  retimeFile,
  shiftFiles,
  shiftGroupTo,
  startOfFiles
} from './clustering'
import { fileChanged, fileStatus, outputKeyOf, uploadGate } from './fileStatus'
import type { FileStatus, OutputFact, RemoteListing, StatusContext } from './fileStatus'
/* arithmetic only — the board draws the rectangle with the same functions processing cuts it with,
   because two ideas of "which pixels" would disagree and the disagreement would be invisible */
import {
  containCrop,
  cropFilter,
  cropToPixels,
  fitRatio,
  FULL_FRAME,
  isQuarterTurn,
  isWholeFrame,
  pictureFilter,
  ROTATIONS,
  turnBy,
  turnedSize,
  withRatio
} from './frameCrop'
import { loadManifest, saveManifest, statProcessedOutputs } from './manifest'
import {
  clearNasSession,
  dsmCreateFolder,
  dsmListFolder,
  dsmLogin,
  dsmLogout,
  dsmValidateSession,
  ensureNasSession,
  loadNasSession,
  loginWithSession,
  updateNasFolder
} from './nas'
import {
  dayInFrench,
  defaultPassengerEmail,
  gmailComposeUrl,
  mailtoUrl,
  renderPassengerEmail
} from './passengerEmail'
import type { PassengerEmail } from './passengerEmail'
import { liveEventSchema, publish, subscribe } from './live'
import type { LiveEvent } from './live'
import { lastSegment, parentOf } from './paths'
import { getGroupProcessedDir, processingNow, processJumps, whenProcessed } from './process'
import { statProxies } from './proxy'
import type { ProxyFact } from './proxy'
import { scanMedia } from './scan'
import {
  EDIT_LOCKED,
  filmNameOf,
  frozenTandems,
  hasEdit,
  isTandem,
  photosNameOf,
  rushesNameOf,
  sameEditedGroup,
  statTandemArtifacts
} from './tandem'
import { watchTandems } from './tandemWatch'
import { furthestBehind, TANDEM_STEPS, tandemSteps } from './tandemSteps'
import type { TandemProgress, TandemStep } from './tandemSteps'
import { tandemEntrySchema, tandemIndexSchema } from './tandemEntry'
import type { TandemEntry, TandemIndex } from './tandemEntry'
import {
  backupOptionsSchema,
  destinationSchema,
  frameCropSchema,
  manifestFileSchema,
  manifestGroupSchema
} from './types'
import type {
  BackupOptions,
  Destination,
  FrameCrop,
  Manifest,
  ManifestFile,
  ManifestGroup,
  Rotation
} from './types'
import {
  goneFromStorage,
  groupsInScope,
  listRemoteFiles,
  scopeKey,
  tandemsRemoteDir,
  uploadScope
} from './upload'
import {
  clearUploadProgress,
  readUploadProgress,
  tandemUploadKey,
  uploadProgressStateSchema,
  writeUploadProgress
} from './uploadProgress'
import type { UploadProgressState } from './uploadProgress'
import { getOutputDir, isoDay, isVideoFile } from './utils'
import {
  buildGroupBaseName,
  buildPassengerFolder,
  hasCompletePassenger,
  mergeGroups,
  passengerName,
  passengerOf
} from './workspace'

export {
  startOfFiles,
  outputKeyOf,
  watchTandems,
  liveEventSchema,
  publish,
  subscribe,
  furthestBehind,
  TANDEM_STEPS,
  tandemSteps,
  backupOptionsSchema,
  boardAnswerSchema,
  buildGroupBaseName,
  buildPassengerFolder,
  clearNasSession,
  clearUploadProgress,
  containCrop,
  cropFilter,
  cropToPixels,
  dayInFrench,
  defaultPassengerEmail,
  destinationSchema,
  dsmCreateFolder,
  dsmListFolder,
  dsmLogin,
  dsmLogout,
  dsmValidateSession,
  EDIT_LOCKED,
  ensureNasSession,
  fileChanged,
  fileStatus,
  filmNameOf,
  fitRatio,
  frameCropSchema,
  frozenTandems,
  FULL_FRAME,
  getGroupProcessedDir,
  getOutputDir,
  gmailComposeUrl,
  goneFromStorage,
  groupFromFiles,
  groupsInScope,
  hasCompletePassenger,
  hasEdit,
  importOutcomeSchema,
  isoDay,
  isQuarterTurn,
  isTandem,
  isVideoFile,
  isWholeFrame,
  lastSegment,
  listRemoteFiles,
  loadManifest,
  loadNasSession,
  loginWithSession,
  mailtoUrl,
  manifestFileSchema,
  manifestGroupSchema,
  mergeGroups,
  parentOf,
  passengerName,
  passengerOf,
  photosNameOf,
  pictureFilter,
  processingNow,
  processJumps,
  readUploadProgress,
  reclusterGroups,
  regroupLooseFiles,
  renderPassengerEmail,
  ROTATIONS,
  rushesNameOf,
  sameEditedGroup,
  saveManifest,
  scanMedia,
  scopeKey,
  offGap,
  retimeFile,
  shiftFiles,
  shiftGroupTo,
  statProcessedOutputs,
  statProxies,
  statTandemArtifacts,
  tandemEntrySchema,
  tandemIndexSchema,
  tandemsRemoteDir,
  tandemUploadKey,
  turnBy,
  turnedSize,
  updateNasFolder,
  uploadGate,
  uploadProgressStateSchema,
  uploadScope,
  whenProcessed,
  withRatio,
  writeUploadProgress
}
export type {
  LiveEvent,
  TandemProgress,
  TandemStep,
  BackupOptions,
  BoardAnswer,
  Destination,
  FileStatus,
  FrameCrop,
  ImportOutcome,
  Manifest,
  ManifestFile,
  ManifestGroup,
  MontageNote,
  OutputFact,
  PassengerEmail,
  ProxyFact,
  RemoteListing,
  Rotation,
  ScanResult,
  StatusContext,
  TandemEntry,
  TandemFact,
  TandemIndex,
  UploadProgressState
}
