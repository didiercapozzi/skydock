import { cancelUploading, loadManifest, whenUploaded } from '@skydock/scripts'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'

/* a page that came back while something was being uploaded waits here for it to finish, and gets the
   board as the upload left it */
const uploadWait: Intent = async ({ manifest, manifestPath }) => {
  await whenUploaded()
  return boardAnswer(loadManifest(manifestPath) ?? manifest)
}

/* Stops what is being uploaded, at any moment, and answers once it has stopped: nothing of it is
   recorded, and what was already sent is found again by the next upload. */
const cancelUpload: Intent = async ({ manifest, manifestPath, refuse }) => {
  if (!cancelUploading()) return refuse('Nothing is being uploaded.')
  await whenUploaded()
  return { ...boardAnswer(loadManifest(manifestPath) ?? manifest), uploadCancelled: true }
}

export { cancelUpload, uploadWait }
