import { i18n } from '@lingui/core'
import { msg, plural, t } from '@lingui/core/macro'
import { useState } from 'react'
import { z } from 'zod'
import type { StorageFile } from '../../../packages/skydock-scripts/src/storageEntry'
import { dsmFolderUrl } from '../helpers/dsm'
import { routingEngine } from '../helpers/routing'
import { refusalSchema } from '../hooks/useBoardState'
import { useStorageFolder } from '../hooks/useStorageFolder'
import type { StorageWhere } from '../hooks/useStorageFolder'
import { Mini } from './buttons'
import { Icon } from './icons'
import { Modal } from './modal'
import { dateLabel, formatSize, hhmm } from './utils'

/* what the storage answered about one file's link: the link it now has, or none */
const linkAnswerSchema = z.object({ path: z.string(), shareUrl: z.string().nullable() })

/* A file on the storage is played through the board's own server, which holds the session; the
   path is the storage's, a piece at a time so a name with a space or an accent survives the trip. */
const storageFileUrl = (filePath: string) =>
  `/api/storage-file${filePath.split('/').map(encodeURIComponent).join('/')}`

/* what each kind of file is called, under its name */
const KIND = { video: msg`video`, photo: msg`photo`, other: msg`file` }

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
        className='max-h-[70vh] w-full rounded-[14px] bg-black'
      />
    ) : (
      <img
        src={storageFileUrl(file.path)}
        alt={file.name}
        className='max-h-[70vh] w-full rounded-[14px] bg-black object-contain'
      />
    )}
    <p className='m-0 font-mono text-[11px] break-all text-ink-3'>{file.path}</p>
  </Modal>
)

/* a button's word as short as the row has room for, and in full to whoever hears it read out */
const Short = ({ shown, said }: { shown: string; said: string }) => (
  <>
    <span aria-hidden='true'>{shown}</span>
    <span className='sr-only'>{said}</span>
  </>
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
        <Icon
          name='link'
          size={14}
          className='text-ink-2'
        />
        {busy ? (
          t`Asking…`
        ) : (
          <Short
            shown={t`Link`}
            said={t`Create a link`}
          />
        )}
      </Mini>
    )
  return (
    <>
      <Mini
        title={shareUrl}
        onClick={() => void copy()}>
        {copied ? (
          `✓ ${t`copied`}`
        ) : (
          <Short
            shown={t`Copy link`}
            said={t`Copy the link`}
          />
        )}
      </Mini>
      <Mini
        disabled={busy}
        title={t`Take the link away — the file stays where it is`}
        onClick={() => onLink(file, 'remove')}>
        <Short
          shown={t`Take link away`}
          said={t`Remove the link`}
        />
      </Mini>
    </>
  )
}

/* The links made and taken away since a folder was listed, by the file they are for — the row answers
   at once rather than the whole folder being asked for again — and the file being watched. Shared by
   the folder's own list and by the cards of what was handed over. */
const useFileActions = (onProblem?: (problem: string) => void) => {
  const [playing, setPlaying] = useState<StorageFile | null>(null)
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
  return { playing, setPlaying, linked, asking, setLink }
}
type FileActionsState = ReturnType<typeof useFileActions>

/* What can be done to one file up there, as buttons beside it: watch it, if it is a film; give it a link,
   copy it, or take it away. */
const FileButtons = ({
  file,
  actions,
  watch
}: {
  file: StorageFile
  actions: FileActionsState
  /* the row itself opens the storage's interface, so the player is a button of its own */
  watch: boolean
}) => (
  <>
    {/* only a video is watched */}
    {watch && file.kind === 'video' && (
      <Mini
        title={t`Watch it from the storage`}
        onClick={() => actions.setPlaying(file)}>
        <Icon
          name='play'
          size={12}
          className='text-ink-2'
        />
        {t`Watch`}
      </Mini>
    )}
    <LinkButtons
      file={file}
      shareUrl={file.path in actions.linked ? (actions.linked[file.path] ?? null) : file.shareUrl}
      busy={actions.asking === file.path}
      onLink={(one, intent) => void actions.setLink(one, intent)}
    />
  </>
)

/* What a place's folder on the storage holds, under the place's own files: a dropzone's folder, a
   passenger's — listed and played from here whether or not any of it is still on this machine. Each
   file says whether it is here too, because "only on the storage" is the one that cannot be made
   again from this board. */
/* the row's own control, whether it plays or opens the storage's interface */
const ROW =
  'flex h-full min-w-0 flex-1 items-center gap-3.5 rounded-[13px] border-0 bg-transparent px-3 text-left no-underline enabled:hover:bg-well disabled:cursor-default'

const StorageFolder = ({
  where,
  stamp,
  dsmHost,
  hereToo,
  onProblem
}: {
  where: StorageWhere
  /* changes when the folder is worth asking for again — after an upload */
  stamp?: unknown
  /* the storage's own address, so each file can be shown in its web interface: where it is known */
  dsmHost?: string | null
  /* the names of the delivered files this machine still holds, where that is known: on a place's
     own page it is, and each file then says whether it is here too */
  hereToo?: Set<string>
  /* what the storage said when it would not do what was asked */
  onProblem?: (problem: string) => void
}) => {
  const [again, setAgain] = useState(0)
  const actions = useFileActions(onProblem)
  const { playing, setPlaying } = actions
  const folder = useStorageFolder(where, `${String(stamp)}:${again}`)
  const files = folder?.ok ? folder.files : []
  const only = hereToo ? files.filter((f) => !hereToo.has(f.name)).length : 0
  const count = files.length

  return (
    <section
      aria-label={t`On the storage`}
      className='mt-5'>
      <div className='flex flex-wrap items-center gap-3 pt-1 pb-2'>
        <h3 className='m-0 font-display text-[20px] font-bold tracking-[-0.03em] text-ink'>{t`On the storage`}</h3>
        {folder?.ok && <code className='font-mono text-[11.5px] text-ink-3'>{folder.dir}</code>}
        {folder?.ok && (
          <span className='text-[13.5px] font-medium text-ink-3'>
            {plural(count, { one: '# file', other: '# files' })}
            {only > 0 ? ` · ${t`${only} only there`}` : ''}
          </span>
        )}
        <span className='ml-auto'>
          <Mini
            onClick={() => setAgain(again + 1)}
            title={t`Ask the storage again what this folder holds`}>
            {t`Look again`}
          </Mini>
        </span>
      </div>
      {!folder ? (
        <p className='m-0 py-3 text-[12.5px] text-ink-3'>{t`Asking the storage…`}</p>
      ) : !folder.ok ? (
        <p className='m-0 mt-2 rounded-xl bg-local-soft px-3.5 py-2.5 text-[12.5px] text-local'>
          {folder.reason}
        </p>
      ) : files.length === 0 ? (
        <p className='m-0 mt-2 rounded-2xl border-2 border-dashed border-line-strong px-3 py-5 text-center text-[12.5px] text-ink-3'>
          {t`Nothing up there yet — what is uploaded from here is listed once it is.`}
        </p>
      ) : (
        <ul className='m-0 flex list-none flex-col p-0'>
          {files.map((file) => {
            const playable = file.kind !== 'other'
            const dsm = dsmHost ? dsmFolderUrl(dsmHost, file.path) : null
            const here = hereToo?.has(file.name) ?? false
            /* when it was shot, as its name says; the storage's own date is only a stand-in for a
               file not named by SkyDock, and says what it is */
            const when = file.shot
              ? `${dateLabel(file.shot)} ${hhmm(file.shot)}`
              : file.mtime
                ? dateLabel(file.mtime)
                : null
            return (
              <li
                key={file.path}
                className='flex h-[60px] items-center gap-2'>
                {dsm ? (
                  <a
                    href={dsm}
                    target='_blank'
                    rel='noreferrer'
                    title={t`Show it in the storage’s own web interface, in a new tab`}
                    className={`${ROW} hover:bg-well`}>
                    <Icon
                      name='storage'
                      size={15}
                      className='text-ink-3'
                    />
                    <span className='flex min-w-0 flex-1 flex-col'>
                      <span className='truncate font-mono text-[12.5px] tracking-[-0.02em] text-ink'>
                        {file.name}
                      </span>
                      <span
                        title={
                          file.shot
                            ? t`Shot then, as its name says`
                            : file.mtime
                              ? t`Put on the storage then — its name does not say when it was shot`
                              : undefined
                        }
                        className='truncate text-[12px] font-medium text-ink-3'>
                        {[
                          i18n._(KIND[file.kind]),
                          file.size === null ? null : formatSize(file.size),
                          when
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    {hereToo && (
                      <span
                        className={`inline-flex h-[22px] flex-none items-center gap-1.5 rounded-full px-[9px] text-[11.5px] font-bold whitespace-nowrap before:size-1.5 before:rounded-full before:content-[''] ${
                          here
                            ? 'bg-up-soft text-up before:bg-current'
                            : 'bg-well text-up before:shadow-[inset_0_0_0_2px_currentColor]'
                        }`}>
                        {here ? t`Here too` : t`Only there`}
                      </span>
                    )}
                  </a>
                ) : (
                  <button
                    type='button'
                    disabled={!playable}
                    onClick={() => setPlaying(file)}
                    title={playable ? t`Play it from the storage` : t`Kept on the storage`}
                    className={ROW}>
                    <Icon
                      name='storage'
                      size={15}
                      className='text-ink-3'
                    />
                    <span className='flex min-w-0 flex-1 flex-col'>
                      <span className='truncate font-mono text-[12.5px] tracking-[-0.02em] text-ink'>
                        {file.name}
                      </span>
                      <span
                        title={
                          file.shot
                            ? t`Shot then, as its name says`
                            : file.mtime
                              ? t`Put on the storage then — its name does not say when it was shot`
                              : undefined
                        }
                        className='truncate text-[12px] font-medium text-ink-3'>
                        {[
                          i18n._(KIND[file.kind]),
                          file.size === null ? null : formatSize(file.size),
                          when
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    {hereToo && (
                      <span
                        className={`inline-flex h-[22px] flex-none items-center gap-1.5 rounded-full px-[9px] text-[11.5px] font-bold whitespace-nowrap before:size-1.5 before:rounded-full before:content-[''] ${
                          here
                            ? 'bg-up-soft text-up before:bg-current'
                            : 'bg-well text-up before:shadow-[inset_0_0_0_2px_currentColor]'
                        }`}>
                        {here ? t`Here too` : t`Only there`}
                      </span>
                    )}
                  </button>
                )}
                <FileButtons
                  file={file}
                  actions={actions}
                  watch={dsm !== null}
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

/* How a montage was handed over — the cards of each folder up there — with, beside each item the
   folder still holds, what can be done to it: watch it, give it a link. The folder is
   asked of the storage for that, and its files are not listed a second time under the cards. */
const StorageCards = ({
  where,
  stamp,
  onProblem,
  children
}: {
  where: StorageWhere
  stamp?: unknown
  onProblem?: (problem: string) => void
  children: (itemActions: (dir: string, name: string) => React.ReactNode) => React.ReactNode
}) => {
  const actions = useFileActions(onProblem)
  const folder = useStorageFolder(where, String(stamp))
  const byPath = new Map((folder?.ok ? folder.files : []).map((file) => [file.path, file]))
  const itemActions = (dir: string, name: string) => {
    const file = byPath.get(`${dir}/${name}`)
    return file ? (
      <FileButtons
        file={file}
        actions={actions}
        watch
      />
    ) : null
  }
  return (
    <>
      {children(itemActions)}
      {actions.playing && (
        <StoragePlayer
          file={actions.playing}
          onClose={() => actions.setPlaying(null)}
        />
      )}
    </>
  )
}

export { StorageCards, StorageFolder, storageFileUrl }
