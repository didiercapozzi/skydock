import { useState } from 'react'
import type { StorageFile } from '../../../packages/skydock-scripts/src/storageEntry'
import { useStorageFolder } from '../hooks/useStorageFolder'
import type { StorageWhere } from '../hooks/useStorageFolder'
import { Mini } from './buttons'
import { Modal } from './modal'
import { dateLabel, formatSize, hhmm, plural } from './utils'

/* A file on the storage is played through the board's own server, which holds the session; the
   path is the storage's, a piece at a time so a name with a space or an accent survives the trip. */
const storageFileUrl = (filePath: string) =>
  `/api/storage-file${filePath.split('/').map(encodeURIComponent).join('/')}`

const GLYPH = { video: '▶', photo: '▣', other: '·' }

/* One file off the storage, played or shown where it is. A film is streamed, not fetched whole: the
   player asks for the part it is showing, so a jump to the middle costs the middle. */
const StoragePlayer = ({ file, onClose }: { file: StorageFile; onClose: () => void }) => (
  <Modal
    label='On the storage'
    title={file.name}
    wide
    onClose={onClose}
    footer={<Mini onClick={onClose}>Close</Mini>}>
    {file.kind === 'video' ? (
      <video
        src={storageFileUrl(file.path)}
        controls
        autoPlay
        aria-label={file.name}
        className='max-h-[70vh] w-full rounded-md bg-black'
      />
    ) : (
      <img
        src={storageFileUrl(file.path)}
        alt={file.name}
        className='max-h-[70vh] w-full rounded-md bg-black object-contain'
      />
    )}
    <p className='m-0 font-mono text-[11px] break-all text-ink-3'>{file.path}</p>
  </Modal>
)

/* What a place's folder on the storage holds, under the place's own files: a dropzone's folder, a
   passenger's — listed and played from here whether or not any of it is still on this machine. Each
   file says whether it is here too, because "only on the storage" is the one that cannot be made
   again from this board. */
const StorageFolder = ({
  where,
  stamp,
  hereToo,
  onBringBack
}: {
  where: StorageWhere
  /* changes when the folder is worth asking for again — after an upload */
  stamp?: unknown
  /* the names of the delivered files this machine still holds, where that is known: on a place's
     own page it is, and each file then says whether it is here too */
  hereToo?: Set<string>
  /* Fetching one back onto this machine, for a file the board knows by its upload record and no
     longer holds. Absent where nothing can be fetched — a folder of a tandem this board never had,
     or a file it never sent. */
  onBringBack?: (file: StorageFile) => void
}) => {
  const [again, setAgain] = useState(0)
  const [playing, setPlaying] = useState<StorageFile | null>(null)
  const folder = useStorageFolder(where, `${String(stamp)}:${again}`)
  const files = folder?.ok ? folder.files : []
  const only = hereToo ? files.filter((f) => !hereToo.has(f.name)).length : 0

  return (
    <section
      aria-label='On the storage'
      className='mt-5'>
      <div className='flex flex-wrap items-baseline gap-2 px-0.5 pb-1.5'>
        <h3 className='m-0 text-[13px] font-semibold text-ink'>On the storage</h3>
        {folder?.ok && (
          <span className='text-[12px] text-ink-2'>
            {plural(files.length, 'file')}
            {only > 0 ? ` · ${only} only there` : ''}
          </span>
        )}
        <Mini
          onClick={() => setAgain(again + 1)}
          title='Ask the storage again what this folder holds'>
          Look again
        </Mini>
        {folder?.ok && (
          <code className='ml-auto font-mono text-[11px] text-ink-3'>{folder.dir}</code>
        )}
      </div>
      {!folder ? (
        <p className='m-0 px-0.5 text-[12.5px] text-ink-3'>Asking the storage…</p>
      ) : !folder.ok ? (
        <p className='m-0 rounded-md bg-local-soft px-3 py-2 text-[12.5px] text-local'>
          {folder.reason}
        </p>
      ) : files.length === 0 ? (
        <p className='m-0 rounded-[9px] border border-dashed border-line px-3 py-4 text-center text-[12.5px] text-ink-3'>
          Nothing up there yet — what is uploaded from here is listed once it is.
        </p>
      ) : (
        <ul className='m-0 flex list-none flex-col gap-px rounded-lg border border-line bg-pane p-[7px]'>
          {files.map((file) => {
            const playable = file.kind !== 'other'
            return (
              <li
                key={file.path}
                className='flex items-center gap-1.5'>
                <button
                  type='button'
                  disabled={!playable}
                  onClick={() => setPlaying(file)}
                  title={playable ? 'Play it from the storage' : 'Kept on the storage'}
                  className='flex h-[34px] min-w-0 flex-1 items-center gap-2.5 rounded-md border border-transparent bg-transparent px-[7px] text-left enabled:hover:bg-line-2 disabled:cursor-default'>
                  <span
                    aria-hidden='true'
                    className='w-3.5 flex-none text-center text-[11px] text-ink-3'>
                    {GLYPH[file.kind]}
                  </span>
                  <span className='min-w-0 flex-1 truncate font-mono text-[12px] text-ink'>
                    {file.name}
                  </span>
                  {hereToo && (
                    <span
                      className={`flex-none rounded-full px-[7px] py-px text-[11px] font-semibold whitespace-nowrap ${
                        hereToo.has(file.name) ? 'bg-line-2 text-ink-3' : 'bg-up-soft text-up'
                      }`}>
                      {hereToo.has(file.name) ? 'here too' : 'only on the storage'}
                    </span>
                  )}
                  {/* when it was shot, as its name says; the storage's own date is only a stand-in
                      for a file not named by SkyDock, and says what it is */}
                  <span
                    title={
                      file.shot
                        ? 'Shot then, as its name says'
                        : file.mtime
                          ? 'Put on the storage then — its name does not say when it was shot'
                          : undefined
                    }
                    className='w-[150px] flex-none text-right font-mono text-[11px] text-ink-3 tabular-nums'>
                    {file.shot
                      ? `${dateLabel(file.shot)} ${hhmm(file.shot)}`
                      : file.mtime
                        ? dateLabel(file.mtime)
                        : ''}
                  </span>
                  <span className='w-[64px] flex-none text-right font-mono text-[11px] text-ink-3 tabular-nums'>
                    {file.size === null ? '' : formatSize(file.size)}
                  </span>
                </button>
                {/* the one thing that cannot be done from anywhere else: what is only up there is
                    footage this machine no longer holds, and this is the way back */}
                {onBringBack && hereToo && !hereToo.has(file.name) && (
                  <Mini
                    title='Fetch it back onto this machine'
                    onClick={() => onBringBack(file)}>
                    Bring it back
                  </Mini>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {playing && (
        <StoragePlayer
          file={playing}
          onClose={() => setPlaying(null)}
        />
      )}
    </section>
  )
}

export { StorageFolder, storageFileUrl }
