import type { Busy, ImportOutcome, MontageNote, ScanResult } from '@skydock/scripts'
import { plural, t } from '@lingui/core/macro'
import { formatFilmSize, localeDate } from '../components/utils'

const montageNote = ({
  clips,
  photos = 0,
  missingAssets,
  opened,
  openCommand,
  openReason
}: MontageNote) => {
  const command = openCommand
  if (clips === 0 && photos === 0 && opened)
    return command ? t`Opening it with ${command}…` : t`Opening it…`
  const made =
    clips > 0
      ? t`Montage ready — ${plural(clips, { one: '# clip', other: '# clips' })} in the bin`
      : t`Montage ready — ${plural(photos, { one: '# photo', other: '# photos' })} in the bin`
  const missing = missingAssets.length
  const names = missingAssets.join(', ')
  const holes =
    missing === 0
      ? ''
      : t`, but the template is missing ${plural(missing, { one: '# file', other: '# files' })}: ${names}`
  const editor = opened
    ? command
      ? ` · ${t`opening it with ${command}`}`
      : ` · ${t`opening it`}`
    : openReason
      ? ` · ${openReason}`
      : ''
  return `${made}${holes}${editor}`
}

const importNote = ({ added, moved, there, kept, failed, where }: ImportOutcome) => {
  const file = added[0]
  const addedCount = added.length
  const { name, from } = moved[0] ?? { name: '', from: '' }
  const movedCount = moved.length
  const reasons = failed.join('; ')
  return (
    [
      addedCount === 1
        ? t`${file} has been added to ${where}`
        : addedCount > 1
          ? t`${plural(addedCount, { one: '# file', other: '# files' })} have been added to ${where}`
          : null,
      movedCount === 1
        ? t`Moved ${name} from ${from} to ${where}`
        : movedCount > 1
          ? t`Moved ${movedCount} files already on the board to ${where}`
          : null,
      there > 0 ? t`${there} already in ${where}` : null,
      kept.length > 0 ? kept.join('; ') : null,
      failed.length > 0 ? t`not added — ${reasons}` : null
    ]
      .filter(Boolean)
      .join(' · ') || t`Nothing was added`
  )
}

const scanNote = (scan: ScanResult) => {
  const { fileCount, groupCount, added, removed, moved } = scan
  return scan.unchanged
    ? t`Scan: nothing new — ${fileCount} files in ${groupCount} jumps`
    : t`Scan: +${added} new, −${removed} gone, ${moved} moved — ${fileCount} files in ${groupCount} jumps`
}

const uploadedNote = (uploaded: number, skipped?: number) => {
  const done = t`Uploaded ${plural(uploaded, { one: '# file', other: '# files' })}`
  return skipped ? `${done} · ${t`${skipped} already on the storage`}` : done
}

const freedNote = ({ files, bytes }: { files: number; bytes: number }) => {
  const day = localeDate(Date.now() / 1000)
  const size = formatFilmSize(bytes)
  return t`On the storage only. ${plural(files, { one: '# file', other: '# files' })} freed from this machine on ${day} — ${size} given back. The project is kept here; everything else is on the storage, as above.`
}

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
}) => {
  const size = formatFilmSize(bytes)
  const freed = t`${place}: ${plural(files, { one: '# file', other: '# files' })} freed from this machine — ${size} given back. They are on the storage only now, listed below.`
  const stays = plural(kept, {
    one: '# not all uploaded yet stays here.',
    other: '# not all uploaded yet stay here.'
  })
  return kept > 0 ? `${freed} ${stays}` : freed
}

const cameraNote = ({
  camera,
  state,
  copied,
  skipped,
  reason,
  unreadable = []
}: {
  camera: string
  state: 'done' | 'gone' | 'failed' | 'copying' | 'stopped'
  copied: number
  skipped: number
  reason?: string
  unreadable?: string[]
}) => {
  const newCopied = t`${plural(copied, { one: '# new file', other: '# new files' })} copied`
  const named = unreadable.join(', ')
  const tally = [
    newCopied,
    skipped > 0 ? t`${skipped} already here` : null,
    unreadable.length > 0 ? t`could not be read, left on the card: ${named}` : null
  ]
    .filter(Boolean)
    .join(' · ')
  if (state === 'gone')
    return t`${camera} was unplugged during the copy — ${tally}; plug it in again for the rest`
  if (state === 'stopped')
    return t`Copying ${camera} stopped when asked — ${tally}; the rest is still on the card for the next Rescan`
  const why = reason ?? t`unknown reason`
  if (state === 'failed') return t`Copying ${camera} stopped: ${why} — ${tally}`
  return copied > 0
    ? t`Camera ${camera}: ${tally}, and scanned`
    : skipped > 0
      ? t`Camera ${camera}: nothing new — all ${skipped} files already here`
      : t`Camera ${camera}: nothing new`
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
    ? t`Times reset — ${plural(files, { one: '# file', other: '# files' })} back on the camera’s time; jumps, names and trims kept`
    : t`Fresh files reset — ${plural(files, { one: '# file', other: '# files' })} back as scanned, in ${plural(jumps, { one: '# jump', other: '# jumps' })}`

const copiedNote = ({ files, passedOver }: { files: number; passedOver: number }) => {
  const done = plural(files, {
    one: 'Copied # file into the jump — it stays where it was as well',
    other: 'Copied # files into the jump — they stay where they were as well'
  })
  return passedOver > 0 ? `${done} · ${t`${passedOver} already there`}` : done
}

const restoredNote = (restored: { who: string; files: number; of: number }[]) => {
  const partly = restored.filter((r) => r.files < r.of)
  const person = restored[0]?.who ?? ''
  const count = restored.length
  const done =
    count === 1
      ? t`Restored ${person}’s montage from the storage’s list — named again, at the times they had; process it to carry on`
      : t`Restored ${count} montages from the storage’s list — named again, at the times they had; process them to carry on`
  const found = partly
    .map(({ who, files, of }) => t`${who}: ${files} of ${of} files found here`)
    .join('; ')
  return partly.length > 0 ? `${done} · ${found}` : done
}

const copiedBackNote = ({ copied, skipped }: { copied: number; skipped: number }) =>
  copied === 0
    ? t`Nothing was copied back — every file asked for is already here.`
    : skipped > 0
      ? t`${plural(copied, { one: '# file', other: '# files' })} copied back off the camera, ${skipped} already here — ready to process again.`
      : t`${plural(copied, { one: '# file', other: '# files' })} copied back off the camera — ready to process again.`

const broughtBackNote = ({ filename, original }: { filename: string; original: boolean }) =>
  original
    ? t`${filename} is back on this machine, as it was shot.`
    : t`${filename} is back — the copy that was delivered, already cut, so its trim is cleared. Process it again from here.`

const fromBinNote = ({ back, kept }: { back: number; kept: string[] }) => {
  const names = kept.join(', ')
  return [
    back > 0
      ? t`${plural(back, { one: '# file', other: '# files' })} back in Fresh files, out of the bin.`
      : null,
    kept.length > 0
      ? plural(kept.length, {
          one: `${names} is on the board already, and stayed in the bin.`,
          other: `${names} are on the board already, and stayed in the bin.`
        })
      : null
  ]
    .filter(Boolean)
    .join(' ')
}

const heldNote = (busy: Busy) =>
  busy === 'processing'
    ? t`It is being processed — wait for it to finish`
    : busy === 'uploading'
      ? t`It is being uploaded — wait for the upload to finish`
      : t`Its film is being rendered — wait for the render to finish, or cancel it`

export {
  heldNote,
  broughtBackNote,
  fromBinNote,
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
