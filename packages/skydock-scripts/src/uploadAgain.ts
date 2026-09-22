import * as fs from 'node:fs'
import * as path from 'node:path'
import { dsmCopyMove } from './nas'
import type { NasSession } from './nas'
import { originsOf } from './originEntry'
import { deliveryFolders, originsDirOf, recordOrigins } from './originIndex'
import { lastSegment, parentOf } from './paths'
import { publishJump } from './publish'
import type { Manifest, ManifestFile } from './types'

/* A file sent again, over one that is already up there.

   Which is the one thing an upload otherwise refuses to do: a file whose bytes are already on the
   storage is skipped, and that is what keeps the same footage from going up twice. Asked for by
   name it is sent anyway — a clip trimmed wrongly and put right, a passenger's film rendered again
   — and then the one up there has to go somewhere.

   It is never written over. SkyDock deletes nothing on the storage, so what is there is moved into
   a bin beside it first, under the moment it was replaced, and stays there until somebody empties
   it by hand. If that move fails, nothing is sent: the old file has to be safe before the new one
   lands, or a bad upload would leave neither. */

const BIN = '.skydock-trash'

const stampOf = (at: Date) =>
  `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}T${String(at.getHours()).padStart(2, '0')}-${String(at.getMinutes()).padStart(2, '0')}-${String(at.getSeconds()).padStart(2, '0')}`

/* The bin sits where the list of origins does — the folder that holds every folder delivered into —
   so one bin serves them all and none of them shows a passenger anything. A share's own recycle bin
   is not used: it can be switched off per share, and a NAS does not reliably say whether it is
   there. */
const binFor = (remotePath: string, at: Date) =>
  `${originsDirOf([parentOf(remotePath)])}/${BIN}/${stampOf(at)}`

const moveAside = async (session: NasSession, remotePath: string, at = new Date()) =>
  await dsmCopyMove(session.hostname, session.sessionId, remotePath, binFor(remotePath, at))

const uploadAgain = async ({
  manifest,
  session,
  fileId,
  at = new Date()
}: {
  manifest: Manifest
  session: NasSession
  fileId: string
  at?: Date
}) => {
  const entry: ManifestFile | undefined = [
    ...manifest.files,
    ...manifest.groups.flatMap((g) => g.files)
  ].find((f) => f.id === fileId)
  if (!entry) throw new Error('That file is no longer on the board.')
  const made = entry.processed
  const sent = entry.uploaded
  if (!made || !fs.existsSync(made.path))
    throw new Error(`${entry.filename} has no copy to send — prepare it again first.`)
  if (!sent)
    throw new Error(`${entry.filename} has not been uploaded, so send it the ordinary way.`)

  if (!(await moveAside(session, sent.remotePath, at)))
    throw new Error(
      `The storage would not put ${lastSegment(sent.remotePath)} aside, so nothing was sent — what is up there is untouched.`
    )

  const result = await publishJump({
    host: session.hostname,
    user: session.username,
    password: '',
    localDir: path.dirname(made.path),
    remoteDir: parentOf(sent.remotePath),
    files: [made.path],
    /* asked for by name: neither the name it has up there nor what it was made from may skip it */
    dedupe: false,
    /* the folder is already where it was: whatever link a passenger was given still points here,
       and asking for another would change nothing but could take one away */
    share: false
  })
  const verdict = result.files[0]
  if (!verdict) throw new Error(`${entry.filename} was not sent.`)

  const put = (file: ManifestFile) =>
    file.id === fileId
      ? {
          ...file,
          uploaded: {
            remotePath: verdict.remotePath,
            md5: verdict.md5,
            size: verdict.size,
            localPath: verdict.localPath,
            at: verdict.at
          }
        }
      : file
  manifest.files = manifest.files.map(put)
  manifest.groups = manifest.groups.map((group) => ({ ...group, files: group.files.map(put) }))

  /* the list says what is up there now — the bytes moved aside stop counting as being on the
     storage, so the same footage is recognised by what replaced it */
  const origins = originsOf(manifest)
  await recordOrigins(session, deliveryFolders(manifest, session), [
    {
      remotePath: verdict.remotePath,
      md5: verdict.md5,
      size: verdict.size,
      at: verdict.at,
      ...origins.get(verdict.localPath)
    }
  ])
  return {
    filename: entry.filename,
    remotePath: verdict.remotePath,
    binned: binFor(sent.remotePath, at)
  }
}

export { binFor, moveAside, uploadAgain }
