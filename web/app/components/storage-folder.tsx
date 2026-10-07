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
import { FileRow, Mark, State } from './file-row'
import { Icon } from './icons'
import { ParcelCards } from './montage-card'
import { Modal } from './modal'
import { Menu, MenuItem } from './settings-menu'
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
        className='max-h-[70vh] w-full rounded-corner bg-black'
      />
    ) : (
      <img
        src={storageFileUrl(file.path)}
        alt={file.name}
        className='max-h-[70vh] w-full rounded-corner bg-black object-contain'
      />
    )}
    <p className='m-0 font-mono text-micro break-all text-ink-3'>{file.path}</p>
  </Modal>
)

/* A file with a link out says so on its row, and pressing the mark copies the link. The place is kept on
   rows that have none, so the words beside it stand in the same columns down the list. The link is in the
   tooltip as well as the clipboard, so a browser that refuses the clipboard still shows it. */
const LinkMark = ({ shareUrl }: { shareUrl: string | null }) => {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* the link is in the mark's tooltip either way */
    }
  }
  return (
    <span className='flex w-control-sm flex-none justify-center'>
      {shareUrl && (
        <button
          type='button'
          aria-label={t`Copy the link`}
          title={shareUrl}
          onClick={() => void copy()}
          className='inline-flex size-control-sm cursor-pointer items-center justify-center rounded-corner border-0 bg-transparent p-0 hover:bg-well'>
          <Icon
            name={copied ? 'check' : 'link'}
            size={14}
            className={copied ? 'text-up' : 'text-accent'}
          />
        </button>
      )}
    </span>
  )
}

/* One file handed out by a link of its own, or that link taken away. A link is a way in — anybody
   holding it fetches that one file — so what it does is said on the item rather than in a dialog
   nobody reads, and taking it away again is one press. */
const LinkItems = ({
  file,
  shareUrl,
  busy,
  onLink,
  close
}: {
  file: StorageFile
  shareUrl: string | null
  busy: boolean
  onLink: (file: StorageFile, intent: 'create' | 'remove') => void
  close: () => void
}) => {
  const link = (intent: 'create' | 'remove') => {
    onLink(file, intent)
    close()
  }
  return shareUrl ? (
    <MenuItem
      icon='link'
      disabled={busy}
      title={t`Take the link away — the file stays where it is`}
      onClick={() => link('remove')}>
      {t`Remove the link`}
    </MenuItem>
  ) : (
    <MenuItem
      icon='link'
      disabled={busy}
      title={t`Give this one file a link — anybody holding it can fetch it, and nothing else in the folder`}
      onClick={() => link('create')}>
      {busy ? t`Asking…` : t`Create a link`}
    </MenuItem>
  )
}

/* The links made and taken away since a folder was listed, by the file they are for — the row answers
   at once rather than the whole folder being asked for again — and the file being watched. Shared by
   the folder's own list and by the cards of what was handed over. A newer listing says what the storage
   holds now, so what was made or taken away before it is forgotten. */
const useFileActions = (listing: unknown, onProblem?: (problem: string) => void) => {
  const [playing, setPlaying] = useState<StorageFile | null>(null)
  const [linked, setLinked] = useState<Record<string, string | null>>({})
  const [listed, setListed] = useState(listing)
  if (listing !== listed) {
    setListed(listing)
    setLinked({})
  }
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

/* What can be done to one file up there: a film is played from a button on its row, a link it has is said by
   a mark that copies it, and the rest — fetching it back, giving a link or taking it away — is behind a ⋯
   menu, so a row stays a name and a few marks however much there is to do. */
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
  /* the file's own link, made and taken away here — a montage's is the panel's */
  links?: boolean
  /* the row itself opens the storage's interface, so the player is a button of its own */
  watch: boolean
  /* whether this machine holds it too, where that is known; only what is not can be brought back */
  here?: boolean
  onBringBack?: (file: StorageFile) => void
}) => {
  /* what is only up there is footage this machine no longer holds, and this is the way back */
  const bringBack = onBringBack && here === false
  const shareUrl = file.path in actions.linked ? (actions.linked[file.path] ?? null) : file.shareUrl
  return (
    <>
      {/* a link that is out there is said on the row, whatever the menu is closed on */}
      {links && <LinkMark shareUrl={shareUrl} />}
      {/* only a video is watched; the place of the button is kept on the rest */}
      {watch &&
        (file.kind === 'video' ? (
          <Mini
            title={t`Watch it from the storage`}
            onClick={() => actions.setPlaying(file)}>
            <Icon
              name='play'
              size={12}
              className='text-ink-2'
            />
            <span className='sr-only'>{t`Watch`}</span>
          </Mini>
        ) : (
          /* as wide as the play button it stands in for */
          <span className='w-10 flex-none' />
        ))}
      {(bringBack || links) && (
        <Menu
          label={t`More`}
          icon='more'>
          {(close) => (
            <>
              {bringBack && (
                <MenuItem
                  icon='back'
                  title={t`Fetch it back onto this machine`}
                  onClick={() => {
                    onBringBack(file)
                    close()
                  }}>
                  {t`Bring back`}
                </MenuItem>
              )}
              {links && (
                <LinkItems
                  file={file}
                  shareUrl={shareUrl}
                  busy={actions.asking === file.path}
                  onLink={(one, intent) => void actions.setLink(one, intent)}
                  close={close}
                />
              )}
            </>
          )}
        </Menu>
      )}
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
  const folder = useStorageFolder(where, `${String(stamp)}:${again}`)
  const actions = useFileActions(folder, onProblem)
  const { playing, setPlaying } = actions
  const held = folder?.ok ? folder.files : []
  const files = held
  const only = hereToo ? held.filter((f) => !hereToo.has(f.name)).length : 0
  const count = files.length

  return (
    <section
      aria-label={t`On the storage`}
      /* what is up there is its own panel, apart from the files here above it: a tint, a hairline and a
         mark of the storage, so it is never taken for more of the list */
      className='mt-10 rounded-corner bg-well/60 px-4 pt-3.5 pb-3 shadow-hairline'>
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
        <div className='flex flex-col gap-2'>
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
            /* opened where it can be: in the storage's own interface, or played from here */
            const open = dsm
              ? () => window.open(dsm, '_blank', 'noreferrer')
              : playable
                ? () => setPlaying(file)
                : undefined
            return (
              <FileRow
                key={file.path}
                {...(open
                  ? {
                      role: 'button',
                      tabIndex: 0,
                      /* a button on the row — play, the menu and what is in it — is not the row pressed */
                      onClick: (e: React.MouseEvent<HTMLElement>) => {
                        if (!(e.target instanceof Element && e.target.closest('button'))) open()
                      },
                      onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
                        if (e.key === 'Enter' && e.target === e.currentTarget)
                          e.currentTarget.click()
                      }
                    }
                  : {})}
                title={
                  dsm
                    ? t`Show it in the storage’s own web interface, in a new tab`
                    : playable
                      ? t`Play it from the storage`
                      : t`Kept on the storage`
                }
                menu
                picture={<Mark icon='storage' />}
                name={file.name}
                meta={
                  <span
                    title={
                      file.shot
                        ? t`Shot then, as its name says`
                        : file.mtime
                          ? t`Put on the storage then — its name does not say when it was shot`
                          : undefined
                    }>
                    {[
                      i18n._(KIND[file.kind]),
                      file.size === null ? null : formatSize(file.size),
                      when
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                }
                trailing={
                  <>
                    {hereToo && (
                      <State
                        tone={here ? 'bg-up-soft text-up' : 'bg-well text-up'}
                        ring={!here}>
                        {here ? t`Here too` : t`Only there`}
                      </State>
                    )}
                    <FileButtons
                      file={file}
                      actions={actions}
                      watch={dsm !== null}
                    />
                  </>
                }
              />
            )
          })}
        </div>
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
   folder still holds, what can be done to it: play it, see and copy its link, and in a menu give or take away one. The folder is
   asked of the storage for that, and its files are not listed a second time under the cards. */
const StorageCards = ({
  where,
  stamp,
  onProblem,
  quiet = false,
  children
}: {
  where: StorageWhere
  stamp?: unknown
  /* no link marks or link items on the files: the montage's link is its panel's */
  quiet?: boolean
  onProblem?: (problem: string) => void
  children: (itemActions: (dir: string, name: string) => React.ReactNode) => React.ReactNode
}) => {
  const folder = useStorageFolder(where, String(stamp))
  const actions = useFileActions(folder, onProblem)
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

/* A destination's folder up there, on its storage tab, drawn as the card a montage's handed-over folder is:
   its path and its files each with what can be done to it. Its link is not here: that is made, and
   taken away, in the destination's own panel. What the folder holds is asked of the storage by the page, which hands it in. */
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
  /* fetching a file back onto this machine, for one that is only up there */
  onBringBack?: (file: StorageFile) => void
  onProblem?: (problem: string) => void
}) => {
  const actions = useFileActions(listing, onProblem)
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
