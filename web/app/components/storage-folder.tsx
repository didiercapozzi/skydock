import { plural, t } from '@lingui/core/macro'
import { useState } from 'react'
import { z } from 'zod'
import type { StorageFile } from '../../../packages/skydock-scripts/src/storageEntry'
import { routingEngine } from '../helpers/routing'
import { refusalSchema } from '../hooks/useBoardState'
import { useStorageFolder } from '../hooks/useStorageFolder'
import type { StorageWhere } from '../hooks/useStorageFolder'
import { Mini } from './buttons'
import { Modal } from './modal'
import { dateLabel, formatSize, hhmm } from './utils'

/* what the storage answered about one file's link: the link it now has, or none */
const linkAnswerSchema = z.object({ path: z.string(), shareUrl: z.string().nullable() })

/* A file on the storage is played through the board's own server, which holds the session; the
   path is the storage's, a piece at a time so a name with a space or an accent survives the trip. */
const storageFileUrl = (filePath: string) =>
  `/api/storage-file${filePath.split('/').map(encodeURIComponent).join('/')}`

const GLYPH = { video: '▶', photo: '▣', other: '·' }

/* One file off the storage, played or shown where it is. A film is streamed, not fetched whole: the
   player asks for the part it is showing, so a jump to the middle costs the middle. */
const StoragePlayer = ({ file, onClose }: { file: StorageFile; onClose: () => void }) => (
  <Modal
    label={t`On the storage`}
    title={file.name}
    wide
    onClose={onClose}
    footer={<Mini onClick={onClose}>{t`Close`}</Mini>}>
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

/* One file handed out by a link of its own, or that link taken away. A link is a way in — anybody
   holding it fetches that one file — so what it does is said on the button rather than in a dialog
   nobody reads, and taking it away again is one press. The link is in the tooltip as well as the
   clipboard, so a browser that refuses the clipboard still shows it. */
const LinkButtons = ({
  file,
  shareUrl,
  busy,
  onLink
}: {
  file: StorageFile
  shareUrl: string | null
  busy: boolean
  onLink: (file: StorageFile, intent: 'create' | 'remove') => void
}) => {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* the link is in the button's tooltip either way */
    }
  }
  if (!shareUrl)
    return (
      <Mini
        disabled={busy}
        title={t`Give this one file a link — anybody holding it can fetch it, and nothing else in the folder`}
        onClick={() => onLink(file, 'create')}>
        {busy ? t`Asking…` : t`Create a link`}
      </Mini>
    )
  return (
    <>
      <Mini
        title={shareUrl}
        onClick={() => void copy()}>
        {copied ? `✓ ${t`copied`}` : t`Copy the link`}
      </Mini>
      <Mini
        disabled={busy}
        title={t`Take the link away — the file stays where it is`}
        onClick={() => onLink(file, 'remove')}>
        {t`Remove the link`}
      </Mini>
    </>
  )
}

/* What a place's folder on the storage holds, under the place's own files: a dropzone's folder, a
   passenger's — listed and played from here whether or not any of it is still on this machine. Each
   file says whether it is here too, because "only on the storage" is the one that cannot be made
   again from this board. */
const StorageFolder = ({
  where,
  stamp,
  hereToo,
  onBringBack,
  onProblem
}: {
  where: StorageWhere
  /* changes when the folder is worth asking for again — after an upload */
  stamp?: unknown
  /* the names of the delivered files this machine still holds, where that is known: on a place's
     own page it is, and each file then says whether it is here too */
  hereToo?: Set<string>
  /* Fetching one back onto this machine, for a file the board knows by its upload record and no
     longer holds. Absent where nothing can be fetched — a folder of a montage this board never had,
     or a file it never sent. */
  onBringBack?: (file: StorageFile) => void
  /* what the storage said when it would not do what was asked */
  onProblem?: (problem: string) => void
}) => {
  const [again, setAgain] = useState(0)
  const [playing, setPlaying] = useState<StorageFile | null>(null)
  /* the links made and taken away since this folder was listed, by the file they are for: the row
     answers at once rather than the whole folder being asked for again */
  const [linked, setLinked] = useState<Record<string, string | null>>({})
  const [asking, setAsking] = useState<string | null>(null)

  const setLink = async (file: StorageFile, intent: 'create' | 'remove') => {
    setAsking(file.path)
    const raw = await routingEngine
      .action({ url: '/api/share-link', actionArgs: { intent, path: file.path } })
      .catch(() => null)
    setAsking(null)
    const done = linkAnswerSchema.safeParse(raw)
    if (done.success) {
      setLinked((was) => ({ ...was, [done.data.path]: done.data.shareUrl }))
      return
    }
    const refused = refusalSchema.safeParse(raw)
    onProblem?.(
      refused.success
        ? (refused.data.globalErrors?.[0] ?? t`The storage would not do that.`)
        : t`The storage would not do that.`
    )
  }
  const folder = useStorageFolder(where, `${String(stamp)}:${again}`)
  const files = folder?.ok ? folder.files : []
  const only = hereToo ? files.filter((f) => !hereToo.has(f.name)).length : 0
  const count = files.length

  return (
    <section
      aria-label={t`On the storage`}
      className='mt-5'>
      <div className='flex flex-wrap items-baseline gap-2 px-0.5 pb-1.5'>
        <h3 className='m-0 text-[13px] font-semibold text-ink'>{t`On the storage`}</h3>
        {folder?.ok && (
          <span className='text-[12px] text-ink-2'>
            {plural(count, { one: '# file', other: '# files' })}
            {only > 0 ? ` · ${t`${only} only there`}` : ''}
          </span>
        )}
        <Mini
          onClick={() => setAgain(again + 1)}
          title={t`Ask the storage again what this folder holds`}>
          {t`Look again`}
        </Mini>
        {folder?.ok && (
          <code className='ml-auto font-mono text-[11px] text-ink-3'>{folder.dir}</code>
        )}
      </div>
      {!folder ? (
        <p className='m-0 px-0.5 text-[12.5px] text-ink-3'>{t`Asking the storage…`}</p>
      ) : !folder.ok ? (
        <p className='m-0 rounded-md bg-local-soft px-3 py-2 text-[12.5px] text-local'>
          {folder.reason}
        </p>
      ) : files.length === 0 ? (
        <p className='m-0 rounded-[9px] border border-dashed border-line px-3 py-4 text-center text-[12.5px] text-ink-3'>
          {t`Nothing up there yet — what is uploaded from here is listed once it is.`}
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
                  title={playable ? t`Play it from the storage` : t`Kept on the storage`}
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
                      {hereToo.has(file.name) ? t`here too` : t`only on the storage`}
                    </span>
                  )}
                  {/* when it was shot, as its name says; the storage's own date is only a stand-in
                      for a file not named by SkyDock, and says what it is */}
                  <span
                    title={
                      file.shot
                        ? t`Shot then, as its name says`
                        : file.mtime
                          ? t`Put on the storage then — its name does not say when it was shot`
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
                    title={t`Fetch it back onto this machine`}
                    onClick={() => onBringBack(file)}>
                    {t`Bring it back`}
                  </Mini>
                )}
                <LinkButtons
                  file={file}
                  shareUrl={file.path in linked ? (linked[file.path] ?? null) : file.shareUrl}
                  busy={asking === file.path}
                  onLink={(one, intent) => void setLink(one, intent)}
                />
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
