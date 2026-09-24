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
  offGap,
  regroupLooseFiles,
  retimeFile,
  shiftFiles,
  shiftGroupTo,
  startOfFiles
} from './clustering'
import { fileChanged, fileStatus, outputKeyOf, uploadGate, UPLOADED_LOCKED } from './fileStatus'
import type { FileStatus, RemoteListing, StatusContext } from './fileStatus'
import { forgetLostFiles } from './forgetLost'
import { learnStorage } from './originIndex'
import { freeablePlace } from './freeable'
import { jsonText } from './lib/json'
import { idsOf, messageOf } from './lib/words'
/* arithmetic only — the board draws the rectangle with the same functions processing cuts it with,
   because two ideas of "which pixels" would disagree and the disagreement would be invisible */
import {
  containCrop,
  cropToPixels,
  fitRatio,
  isQuarterTurn,
  isWholeFrame,
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
  shareLinkFor
} from './nas'
import {
  defaultPassengerEmail,
  gmailComposeUrl,
  mailtoUrl,
  renderPassengerEmail
} from './passengerEmail'
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
import { cutFrom } from './jumpMoments'
import { MOMENTS, nameOfMoment } from './moments'
import type { Moment } from './moments'
import { jumpTrack } from './jumpTrack'
import { statProxies } from './proxy'
import { rememberOutputDir, resolveOutputDir } from './settings'
import { stopTools } from './tools'
import { scanMedia } from './scan'
import {
  EDIT_LOCKED,
  filmNameOf,
  frozenTandems,
  hasEdit,
  isTandem,
  sameEditedGroup,
  statTandemArtifacts
} from './tandem'
import { DEFAULT_PLAN, itemsFrom, PARTS, planOf, stemOf } from './sending'
import type { PartFile, SendItem } from './sending'
import { watchTandems } from './tandemWatch'
import { furthestBehind, tandemSteps } from './tandemSteps'
import type { TandemProgress } from './tandemSteps'
import { folderOfUpload } from './tandemIndex'
import type { TandemEntry } from './tandemEntry'
import {
  destinationSchema,
  sendPlanSchema,
  jumpTrackSchema,
  manifestFileSchema,
  manifestGroupSchema
} from './types'
import type {
  Destination,
  SendPart,
  SendPlan,
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
  earlierTandemsDir,
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
import { ffmpegPath, getOutputDir, isoDay, isVideoFile } from './utils'
import {
  buildPassengerFolder,
  hasCompletePassenger,
  mergeGroups,
  montageCalled,
  passengerFrom,
  passengerName,
  passengerOf
} from './workspace'
import { isFiled, isMontage } from './filed'

export {
  cutFrom,
  jumpTrack,
  rememberOutputDir,
  stopTools,
  resolveOutputDir,
  freeablePlace,
  jsonText,
  idsOf,
  messageOf,
  startOfFiles,
  outputKeyOf,
  watchTandems,
  liveEventSchema,
  publish,
  subscribe,
  furthestBehind,
  isFiled,
  isMontage,
  folderOfUpload,
  tandemSteps,
  sendPlanSchema,
  DEFAULT_PLAN,
  itemsFrom,
  PARTS,
  planOf,
  stemOf,
  boardAnswerSchema,
  buildPassengerFolder,
  clearNasSession,
  clearUploadProgress,
  containCrop,
  createShareLink,
  cropToPixels,
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
  frozenTandems,
  getGroupProcessedDir,
  ffmpegPath,
  getOutputDir,
  gmailComposeUrl,
  goneFromStorage,
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
  montageCalled,
  MOMENTS,
  nameOfMoment,
  parentOf,
  passengerFrom,
  passengerName,
  passengerOf,
  cancelProcessing,
  processingNow,
  processJumps,
  readUploadProgress,
  regroupLooseFiles,
  removeShareLink,
  renderPassengerEmail,
  sameEditedGroup,
  saveManifest,
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
  earlierTandemsDir,
  tandemsRemoteDir,
  tandemUploadKey,
  turnBy,
  turnedSize,
  uploadGate,
  UPLOADED_LOCKED,
  uploadProgressStateSchema,
  uploadScope,
  whenProcessed,
  withRatio,
  writeUploadProgress
}
export type {
  LiveEvent,
  TandemProgress,
  PartFile,
  SendItem,
  SendPart,
  SendPlan,
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
  Moment,
  MontageNote,
  OutputFact,
  ProxyFact,
  RemoteListing,
  Rotation,
  ScanResult,
  StatusContext,
  TandemEntry,
  TandemFact,
  UploadProgressState
}
