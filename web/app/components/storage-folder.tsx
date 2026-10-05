import { i18n } from '@lingui/core'
import { msg, plural, t } from '@lingui/core/macro'
import { useState } from 'react'
import { z } from 'zod'
import type {
  StorageFile,
  StorageFolder as StorageListing
} from '../../../packages/skydock-scripts/src/storageEntry'
import { dsmFolderUrl } from '../helpers/dsm'
import { routingEngine } from '../helpers/routing'
import { refusalSchema } from '../hooks/useBoardState'
import { useStorageFolder } from '../hooks/useStorageFolder'
import type { StorageWhere } from '../hooks/useStorageFolder'
import { parcelOfFolder } from '../helpers/parcels'
import { Mini } from './buttons'
import { Empty, Problem } from './blurbs'
import { Icon } from './icons'
import { ParcelCards } from './montage-card'
import { Modal } from './modal'
import { dateLabel, formatSize, hhmm } from './utils'

const linkAnswerSchema = z.object({ path: z.string(), shareUrl: z.string().nullable() })

const storageFileUrl = (filePath: string) =>
  `/api/storage-file${filePath.split('/').map(encodeURIComponent).join('/')}`

const KIND = { video: msg`video`, photo: msg`photo`, other: msg`file` }

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
        className='max-h-[70vh] w-full rounded-card bg-black'
      />
    ) : (
      <img
        src={storageFileUrl(file.path)}
        alt={file.name}
        className='max-h-[70vh] w-full rounded-card bg-black object-contain'
      />
    )}
    <p className='m-0 font-mono text-micro break-all text-ink-3'>{file.path}</p>
  </Modal>
)

const Short = ({ shown, said }: { shown: string; said: string }) => (
  <>
    <span aria-hidden='true'>{shown}</span>
    <span className='sr-only'>{said}</span>
  </>
)

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
    } catch {}
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

const FileButtons = ({
  file,
  actions,
  watch,
  here,
  onBringBack,
  links = true
}: {
  file: StorageFile
  actions: FileActionsState
  links?: boolean
  watch: boolean
  here?: boolean
  onBringBack?: (file: StorageFile) => void
}) => (
  <>
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
    {onBringBack && here === false && (
      <Mini
        title={t`Fetch it back onto this machine`}
        onClick={() => onBringBack(file)}>
        <Icon
          name='back'
          size={14}
          className='text-ink-2'
        />
        {t`Bring back`}
      </Mini>
    )}
    {links && (
      <LinkButtons
        file={file}
        shareUrl={file.path in actions.linked ? (actions.linked[file.path] ?? null) : file.shareUrl}
        busy={actions.asking === file.path}
        onLink={(one, intent) => void actions.setLink(one, intent)}
      />
    )}
  </>
)

const ROW =
  'flex h-full min-w-0 flex-1 items-center gap-3.5 rounded-card border-0 bg-transparent px-3 text-left no-underline enabled:hover:bg-pane disabled:cursor-default'

const StorageFolder = ({
  where,
  stamp,
  dsmHost,
  hereToo,
  onProblem
}: {
  where: StorageWhere
  stamp?: unknown
  dsmHost?: string | null
  hereToo?: Set<string>
  onProblem?: (problem: string) => void
}) => {
  const [again, setAgain] = useState(0)
  const actions = useFileActions(onProblem)
  const { playing, setPlaying } = actions
  const folder = useStorageFolder(where, `${String(stamp)}:${again}`)
  const held = folder?.ok ? folder.files : []
  const files = held
  const only = hereToo ? held.filter((f) => !hereToo.has(f.name)).length : 0
  const count = files.length

  return (
    <section
      aria-label={t`On the storage`}
      className='mt-10 rounded-panel bg-well/60 px-4 pt-3.5 pb-3 shadow-hairline'>
      <div className='flex flex-wrap items-center gap-3 pt-1 pb-2'>
        <h3 className='m-0 flex items-center gap-2 font-display text-heading font-bold tracking-display text-ink'>
          <Icon
            name='storage'
            size={18}
            className='text-accent'
          />
          {t`On the storage`}
        </h3>
        {folder?.ok && <code className='font-mono text-micro text-ink-3'>{folder.dir}</code>}
        {folder?.ok && (
          <span className='text-lead font-medium text-ink-3'>
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
        <p className='m-0 py-3 text-body text-ink-3'>{t`Asking the storage…`}</p>
      ) : !folder.ok ? (
        <Problem className='mt-2'>{folder.reason}</Problem>
      ) : files.length === 0 ? (
        <Empty className='mt-2'>
          {t`Nothing up there yet — what is uploaded from here is listed once it is.`}
        </Empty>
      ) : (
        <ul className='m-0 flex list-none flex-col p-0'>
          {files.map((file) => {
            const playable = file.kind !== 'other'
            const dsm = dsmHost ? dsmFolderUrl(dsmHost, file.path) : null
            const here = hereToo?.has(file.name) ?? false
            const when = file.shot
              ? `${dateLabel(file.shot)} ${hhmm(file.shot)}`
              : file.mtime
                ? dateLabel(file.mtime)
                : null
            return (
              <li
                key={file.path}
                className='flex h-15 items-center gap-2'>
                {dsm ? (
                  <a
                    href={dsm}
                    target='_blank'
                    rel='noreferrer'
                    title={t`Show it in the storage’s own web interface, in a new tab`}
                    className={`${ROW} hover:bg-pane`}>
                    <Icon
                      name='storage'
                      size={15}
                      className='text-ink-3'
                    />
                    <span className='flex min-w-0 flex-1 flex-col'>
                      <span className='truncate font-mono text-body tracking-title text-ink'>
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
                        className='truncate text-small font-medium text-ink-3'>
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
                        className={`inline-flex h-chip flex-none items-center gap-1.5 rounded-full px-2.25 text-micro font-bold whitespace-nowrap before:size-1.5 before:rounded-full before:content-[''] ${
                          here
                            ? 'bg-up-soft text-up before:bg-current'
                            : 'bg-well text-up before:shadow-ring-current'
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
                      <span className='truncate font-mono text-body tracking-title text-ink'>
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
                        className='truncate text-small font-medium text-ink-3'>
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
                        className={`inline-flex h-chip flex-none items-center gap-1.5 rounded-full px-2.25 text-micro font-bold whitespace-nowrap before:size-1.5 before:rounded-full before:content-[''] ${
                          here
                            ? 'bg-up-soft text-up before:bg-current'
                            : 'bg-well text-up before:shadow-ring-current'
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

const StorageCards = ({
  where,
  stamp,
  onProblem,
  quiet = false,
  children
}: {
  where: StorageWhere
  stamp?: unknown
  quiet?: boolean
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
        links={!quiet}
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

const FolderCard = ({
  listing,
  dsmHost,
  hereToo,
  onAgain,
  onBringBack,
  onProblem
}: {
  listing: StorageListing | null
  dsmHost?: string | null
  hereToo?: Set<string>
  onAgain: () => void
  onBringBack?: (file: StorageFile) => void
  onProblem?: (problem: string) => void
}) => {
  const actions = useFileActions(onProblem)
  const byPath = new Map((listing?.ok ? listing.files : []).map((file) => [file.path, file]))
  const itemActions = (dir: string, name: string) => {
    const file = byPath.get(`${dir}/${name}`)
    return file ? (
      <FileButtons
        file={file}
        actions={actions}
        watch
        here={hereToo ? hereToo.has(file.name) : undefined}
        onBringBack={onBringBack}
      />
    ) : null
  }
  return (
    <section aria-label={t`On the storage`}>
      <div className='flex justify-end'>
        <Mini
          onClick={onAgain}
          title={t`Ask the storage again what this folder holds`}>
          {t`Look again`}
        </Mini>
      </div>
      {!listing ? (
        <p className='m-0 py-3 text-body text-ink-3'>{t`Asking the storage…`}</p>
      ) : !listing.ok ? (
        <Problem className='mt-2'>{listing.reason}</Problem>
      ) : (
        <ParcelCards
          parcels={[parcelOfFolder({ dir: listing.dir, files: listing.files, hereToo })]}
          dsmHost={dsmHost}
          itemActions={itemActions}
        />
      )}
      {actions.playing && (
        <StoragePlayer
          file={actions.playing}
          onClose={() => actions.setPlaying(null)}
        />
      )}
    </section>
  )
}

export { FolderCard, StorageCards, StorageFolder }
