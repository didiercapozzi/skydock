/* What the web app may import. Everything else in this package is internal to it — the tests reach
   into the modules directly, so this stays exactly as wide as the app needs. What shells out or
   reaches the filesystem behind a click — building proxies, uploading a tandem, importing a file,
   freeing, taking back — is imported by the routes straight from its module, so none of it can
   reach the browser bundle. */
import { boardAnswerSchema, importOutcomeSchema } from './boardAnswer'
import type {
  BoardAnswer,
  ImportOutcome,
  MontageNote,
  OutputFact,
  ProxyFact,
  ScanResult,
  TandemFact
} from './boardAnswer'
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
import type { FileStatus, RemoteListing, StatusContext } from './fileStatus'
import { forgetLostFiles } from './forgetLost'
import { learnStorage } from './originIndex'
import { freeablePlace } from './freeable'
import { jsonText } from './lib/json'
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
  createShareLink,
  ensureNasSession,
  listShareLinks,
  liveShareLinks,
  loadNasSession,
  loginWithSession,
  needsCode,
  removeShareLink,
  shareLinkFor,
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
import {
  cancelProcessing,
  getGroupProcessedDir,
  processingNow,
  processJumps,
  whenProcessed
} from './process'
import { cutFrom, jumpMoments, RUN_UP } from './jumpMoments'
import { jumpTrack } from './jumpTrack'
import { statProxies } from './proxy'
import { rememberOutputDir, resolveOutputDir } from './settings'
import { stopTools } from './tools'
import { keepProject, keptProjectsDir } from './projectHistory'
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
  jumpTrackSchema,
  manifestFileSchema,
  manifestGroupSchema
} from './types'
import type {
  BackupOptions,
  Destination,
  FrameCrop,
  JumpMoments,
  JumpTrack,
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
  cutFrom,
  jumpMoments,
  jumpTrack,
  RUN_UP,
  rememberOutputDir,
  stopTools,
  resolveOutputDir,
  freeablePlace,
  jsonText,
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
  createShareLink,
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
  forgetLostFiles,
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
  learnStorage,
  listShareLinks,
  liveShareLinks,
  listRemoteFiles,
  loadManifest,
  loadNasSession,
  loginWithSession,
  needsCode,
  mailtoUrl,
  jumpTrackSchema,
  manifestFileSchema,
  manifestGroupSchema,
  mergeGroups,
  parentOf,
  passengerName,
  passengerOf,
  photosNameOf,
  pictureFilter,
  cancelProcessing,
  processingNow,
  processJumps,
  readUploadProgress,
  reclusterGroups,
  regroupLooseFiles,
  removeShareLink,
  renderPassengerEmail,
  ROTATIONS,
  rushesNameOf,
  sameEditedGroup,
  saveManifest,
  keepProject,
  keptProjectsDir,
  scanMedia,
  scopeKey,
  shareLinkFor,
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
  JumpMoments,
  JumpTrack,
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
