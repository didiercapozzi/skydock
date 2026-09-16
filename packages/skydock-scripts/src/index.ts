/* What the web app may import. Everything else in this package is internal to it — the tests reach
   into the modules directly, so this stays exactly as wide as the app needs. */

export type { Destination, Manifest, ManifestFile, ManifestGroup } from './types'
export { destinationSchema, manifestFileSchema, manifestGroupSchema } from './types'

export { groupFromFiles, reclusterGroups, regroupLooseFiles, shiftFiles } from './clustering'

export { fileStatus, uploadGate } from './fileStatus'
export type { FileStatus, OutputFact, RemoteListing } from './fileStatus'

export { buildGroupBaseName, hasCompletePassenger, mergeGroups } from './workspace'

export { loadManifest, saveManifest, statProcessedOutputs } from './manifest'

export { groupsInScope, listRemoteFiles, scopeKey, uploadScope } from './upload'

export {
  clearUploadProgress,
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
  updateDefaultFolder
} from './nas'

export { getOutputDir, isVideoFile } from './utils'

export { scanMedia } from './scan'
export { getGroupProcessedDir, processJumps } from './process'
