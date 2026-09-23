import type { ImportOutcome, MontageNote, ScanResult } from '@skydock/scripts'
import { formatFilmSize, localeDate, plural } from '../components/utils'

/* What the board says in its one line after a change, in the board's words. */

/* A template that came without its music and logos still produces a project, and the holes only
   show up at the render — so they are said out loud the moment the montage is made. */
const montageNote = ({ clips, missingAssets, opened, openCommand, openReason }: MontageNote) => {
  /* naming the command is what turns "nothing happened" into something that can be looked into:
     it is the one part of this the board knows and the person at the screen cannot see */
  const with_ = openCommand ? ` with ${openCommand}` : ''
  if (clips === 0 && opened) return `Opening it${with_}…`
  const made = `Montage ready — ${plural(clips, 'clip')} in the bin, and two empty tracks to lay them on`
  const holes =
    missingAssets.length === 0
      ? ''
      : `, but the template is missing ${plural(missingAssets.length, 'file')}: ${missingAssets.join(', ')}`
  /* whether the editor came up is part of what just happened, not a separate thing to go and check */
  const editor = opened ? ` · opening it${with_}` : openReason ? ` · ${openReason}` : ''
  return `${made}${holes}${editor}`
}

/* what a drop from the computer came to, in one line */
const importNote = ({ added, moved, there, kept, failed, where }: ImportOutcome) =>
  [
    /* named when it is one file, which is what a drop usually is */
    added.length === 1
      ? `${added[0]} has been added to ${where}`
      : added.length > 1
        ? `${plural(added.length, 'file')} have been added to ${where}`
        : null,
    /* already on the board: moved here, the way a drag on the board would have */
    moved.length === 1
      ? `Moved ${moved[0]!.name} from ${moved[0]!.from} to ${where}`
      : moved.length > 1
        ? `Moved ${moved.length} files already on the board to ${where}`
        : null,
    there > 0 ? `${there} already in ${where}` : null,
    /* nothing to do and a reason, which reads as itself rather than as a failure */
    kept.length > 0 ? kept.join('; ') : null,
    failed.length > 0 ? `not added — ${failed.join('; ')}` : null
  ]
    .filter(Boolean)
    .join(' · ') || 'Nothing was added'

const scanNote = (scan: ScanResult) =>
  scan.unchanged
    ? `Scan: nothing new — ${scan.fileCount} files in ${scan.groupCount} jumps`
    : `Scan: +${scan.added} new, −${scan.removed} gone, ${scan.moved} moved — ${scan.fileCount} files in ${scan.groupCount} jumps`

const uploadedNote = (uploaded: number, skipped?: number) =>
  `Uploaded ${plural(uploaded, 'file')}${skipped ? ` · ${skipped} already on the NAS` : ''}`

const freedNote = ({ files, bytes }: { files: number; bytes: number }) =>
  `On the storage only. ${plural(files, 'file')} freed from this machine on ${localeDate(Date.now() / 1000)} — ${formatFilmSize(bytes)} given back. The project is kept here; everything else is on the storage, as above.`

const freedPlaceNote = ({
  place,
  files,
  bytes,
  kept
}: {
  place: string
  files: number
  bytes: number
  kept: number
}) =>
  `${place}: ${plural(files, 'file')} freed from this machine — ${formatFilmSize(bytes)} given back. They are on the storage only now, listed below.${kept > 0 ? ` ${kept} not all uploaded yet ${kept === 1 ? 'stays' : 'stay'} here.` : ''}`

/* what came off a camera plugged in, in one line */
const cameraNote = ({
  camera,
  state,
  copied,
  skipped,
  reason
}: {
  camera: string
  state: 'done' | 'gone' | 'failed' | 'copying'
  copied: number
  skipped: number
  reason?: string
}) => {
  const tally = `${plural(copied, 'new file')} copied${skipped > 0 ? ` · ${skipped} already here` : ''}`
  if (state === 'gone')
    return `${camera} was unplugged during the copy — ${tally}; plug it in again for the rest`
  if (state === 'failed')
    return `Copying ${camera} stopped: ${reason ?? 'unknown reason'} — ${tally}`
  return copied > 0
    ? `Camera ${camera}: ${tally}, and scanned`
    : `Camera ${camera}: nothing new${skipped > 0 ? ` — all ${skipped} files already here` : ''}`
}

const resetNote = ({
  files,
  jumps,
  what
}: {
  files: number
  jumps: number
  what: 'times' | 'everything'
}) =>
  what === 'times'
    ? `Times reset — ${plural(files, 'file')} back on the camera’s time; jumps, names and trims kept`
    : `Fresh files reset — ${plural(files, 'file')} back as scanned, in ${plural(jumps, 'jump')}`

/* files copied into another jump, which is then to be processed again */
const copiedNote = ({ files, passedOver }: { files: number; passedOver: number }) =>
  `Copied ${plural(files, 'file')} into the jump — ${files === 1 ? 'it stays' : 'they stay'} where ${
    files === 1 ? 'it was' : 'they were'
  } as well${passedOver > 0 ? ` · ${passedOver} already there` : ''}`

/* tandems put back from the storage's list, and what is left to do about them */
const restoredNote = (restored: { who: string; files: number; of: number }[]) => {
  const partly = restored.filter((r) => r.files < r.of)
  const who = restored.length === 1 ? `${restored[0]!.who}’s tandem` : `${restored.length} tandems`
  return `Restored ${who} from the storage’s list — named again, at the times they had; process ${
    restored.length === 1 ? 'it' : 'them'
  } to carry on${
    partly.length > 0
      ? ` · ${partly.map((r) => `${r.who}: ${r.files} of ${r.of} files found here`).join('; ')}`
      : ''
  }`
}

/* Files asked back off a camera: they are here again, and they are where they always were — the
   jump they were in, by what they contain (RULES, Freeing space). Their delivered copies went with
   the freeing, so they are files to prepare again. */
const copiedBackNote = ({ copied, skipped }: { copied: number; skipped: number }) =>
  copied === 0
    ? 'Nothing was copied back — every file asked for is already here.'
    : `${plural(copied, 'file')} copied back off the camera${
        skipped > 0 ? `, ${skipped} already here` : ''
      } — ready to prepare again.`

/* What came back off the storage, and what it is: a tandem's originals go up as themselves, a
   dropzone's never do — so what returns from a dropzone is the copy that was delivered, already
   trimmed and cropped, and the board says so rather than letting somebody find out later. */
const broughtBackNote = ({ filename, original }: { filename: string; original: boolean }) =>
  original
    ? `${filename} is back on this machine, as it was shot.`
    : `${filename} is back — the copy that was delivered, already cut, so its trim is cleared. Prepare it again from here.`

export {
  broughtBackNote,
  cameraNote,
  copiedBackNote,
  copiedNote,
  resetNote,
  freedNote,
  freedPlaceNote,
  importNote,
  montageNote,
  restoredNote,
  scanNote,
  uploadedNote
}
