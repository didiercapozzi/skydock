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
  const made = `Montage ready — ${plural(clips, 'clip')} on the timeline`
  const holes =
    missingAssets.length === 0
      ? ''
      : `, but the template is missing ${plural(missingAssets.length, 'file')}: ${missingAssets.join(', ')}`
  /* whether the editor came up is part of what just happened, not a separate thing to go and check */
  const editor = opened ? ` · opening it${with_}` : openReason ? ` · ${openReason}` : ''
  return `${made}${holes}${editor}`
}

/* what a drop from the computer came to, in one line */
const importNote = ({ added, moved, there, failed, where }: ImportOutcome) =>
  [
    added > 0 ? `Added ${plural(added, 'file')} to ${where}` : null,
    /* already on the board: moved here, the way a drag on the board would have */
    moved.length === 1
      ? `Moved ${moved[0]!.name} from ${moved[0]!.from} to ${where}`
      : moved.length > 1
        ? `Moved ${moved.length} files already on the board to ${where}`
        : null,
    there > 0 ? `${there} already in ${where}` : null,
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

export { copiedNote, freedNote, importNote, montageNote, restoredNote, scanNote, uploadedNote }
