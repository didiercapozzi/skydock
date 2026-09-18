/* What the web app may import. Everything else in this package is internal to it — the tests reach
   into the modules directly, so this stays exactly as wide as the app needs. */

export type { Destination, FrameCrop, Manifest, ManifestFile, ManifestGroup } from './types'
export {
  destinationSchema,
  frameCropSchema,
  manifestFileSchema,
  manifestGroupSchema
} from './types'

/* arithmetic only — the board draws the rectangle with the same functions processing cuts it with,
   because two ideas of "which pixels" would disagree and the disagreement would be invisible */
export {
  containCrop,
  cropFilter,
  cropToPixels,
  fitRatio,
  FULL_FRAME,
  isWholeFrame,
  withRatio
} from './frameCrop'

export { groupFromFiles, reclusterGroups, regroupLooseFiles, shiftFiles } from './clustering'

export { fileChanged, fileStatus, uploadGate } from './fileStatus'
export type { FileStatus, OutputFact, RemoteListing, StatusContext } from './fileStatus'

export {
  buildGroupBaseName,
  buildPassengerFolder,
  hasCompletePassenger,
  mergeGroups
} from './workspace'

export { loadManifest, saveManifest, statProcessedOutputs } from './manifest'

/* only where each clip's proxy has got to — building them shells out to ffmpeg, so the routes
   import that side of it directly */
export { statProxies } from './proxy'
export type { ProxyFact } from './proxy'

export {
  goneFromStorage,
  groupsInScope,
  listRemoteFiles,
  scopeKey,
  tandemsRemoteDir,
  uploadScope
} from './upload'

export {
  clearUploadProgress,
  deliverScopeKey,
  readUploadProgress,
  uploadProgressStateSchema,
  writeUploadProgress
} from './uploadProgress'
export type { UploadProgressState } from './uploadProgress'

export {
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

export { getOutputDir, isVideoFile, isoDay } from './utils'

export { scanMedia } from './scan'
export { getGroupProcessedDir, processingNow, processJumps, whenProcessed } from './process'

/* only the facts a tandem row shows — delivering one pulls in archiving and uploading, which the
   routes import directly so none of it can reach the browser bundle */
export {
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
export {
  dayInFrench,
  defaultPassengerEmail,
  gmailComposeUrl,
  mailtoUrl,
  renderPassengerEmail
} from './passengerEmail'
export type { PassengerEmail } from './passengerEmail'
export { tandemEntrySchema, tandemIndexSchema } from './tandemEntry'
export type { TandemEntry, TandemIndex } from './tandemEntry'
