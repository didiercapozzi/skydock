import { plural, t } from '@lingui/core/macro'
import {
  EDIT_LOCKED,
  goneSent,
  hasCompletePassenger,
  isMontage,
  isVideoFile,
  passengerOf,
  waitingForProxy
} from '@skydock/scripts'
import { useBoard } from '../hooks/useBoardModel'
import { StorageCards } from './storage-folder'
import { parcelsOfGroup } from '../helpers/parcels'
import { dayLabel, dayOf } from '../helpers/jumps'
import { Danger, Mini } from './buttons'
import { Icon } from './icons'
import { MenuItem } from './settings-menu'
import { Part } from './inspector'
import {
  FilmNote,
  FilmStrip,
  GoneFromStorage,
  MontageCardActions,
  UploadedCards
} from './montage-card'
import { NextStep } from './montage-steps'
import type { ManifestGroup } from './types'
import { kindsSaid } from './kinds'
import { dayShort, formatSize, getPictureUrl, shortDate } from './utils'

/* What belongs to a montage's own page: the card with its next step, what its upload handed over,
   the film, and its two ways back. */

/* a frame off a montage's own footage, to stand for its film until the film plays */
const filmPicture = (group: ManifestGroup) => {
  const file = group.files.find((f) => isVideoFile(f.path)) ?? group.files[0]
  return file ? getPictureUrl(file, undefined, 640) : undefined
}

/* A montage's line carries its one next step, and its upload while it runs — beside its film. */
const MontageActions = ({ group }: { group: ManifestGroup }) => {
  const model = useBoard()
  const { board } = model
  const progress = model.progressOf(group)
  if (!isMontage(group) || group.freed || !progress) return null
  const facts = board.montageFacts[group.id]
  const linked = Boolean(group.uploaded?.shareUrl ?? group.publish?.shareUrl)
  /* everything is up but there is no link to send: the next step is making one, from the panel, and the
     card carries no button of its own — freeing is in the menu, as at every step */
  const needsLink =
    Boolean(group.uploaded) && !linked && progress.steps[progress.at]?.name === 'Emailed'
  const actions = (compact: boolean) => (
    <MontageCardActions
      group={group}
      facts={facts}
      busy={board.busy}
      upload={board.uploading ? { key: board.uploading, label: board.uploadLabel ?? '' } : null}
      blocked={model.gateFor(group.files)}
      proxiesWaiting={waitingForProxy(group.files, board.proxies).length}
      named={hasCompletePassenger(group.passenger)}
      onProcess={() => model.takeStep(group, 'Processed')}
      onCancelProcess={model.cancelProcess}
      onMontage={() => model.takeStep(group, 'Edited')}
      onOpenMontage={() => model.takeStep(group, 'Rendered')}
      onUpload={() => model.takeStep(group, 'Uploaded')}
      onEmail={
        group.uploaded && linked && progress.steps[progress.at]?.name === 'Emailed'
          ? {
              name: group.passenger?.firstname ?? '',
              open: () => model.takeStep(group, 'Emailed')
            }
          : undefined
      }
      onFree={
        compact && needsLink
          ? undefined
          : () => model.setDialog({ kind: 'free', groupId: group.id })
      }
      compact={compact}
    />
  )
  return (
    <NextStep
      progress={progress}
      who={group.passenger?.firstname}
      linked={linked}
      mini={Boolean(group.uploaded)}
      film={
        facts?.film && !group.uploaded ? (
          <FilmStrip
            facts={facts}
            picture={filmPicture(group)}>
            {actions(false)}
          </FilmStrip>
        ) : undefined
      }>
      {actions(true)}
    </NextStep>
  )
}

/* what a montage's upload handed over, as it was handed over, and what has gone missing of it since */
const HandedOver = ({
  group,
  itemActions,
  onLink,
  quiet
}: {
  group: ManifestGroup
  itemActions?: (dir: string, name: string) => React.ReactNode
  /* its folder's link taken away */
  onLink?: (dir: string, make: boolean) => void
  /* the folders without their link line: the link is the panel's */
  quiet?: boolean
}) => {
  const model = useBoard()
  return (
    <>
      <GoneFromStorage
        gone={model.goneById[group.id] ?? []}
        at={model.board.groups.find((g) => g.id === group.id)?.uploaded?.at}
      />
      {group.uploaded && (
        <UploadedCards
          group={group}
          dsmHost={model.nas.host}
          places={model.board.places}
          gone={new Set(goneSent(group.uploaded, model.nas.remote))}
          itemActions={itemActions}
          onLink={onLink}
          quiet={quiet}
        />
      )}
    </>
  )
}

/* above a montage's files: what went missing from the storage, what the storage holds, the film and
   what holds its files while it has an edit */
const MontageAbove = ({
  group,
  withFilm,
  tabbed
}: {
  group: ManifestGroup
  withFilm: boolean
  /* the montage has its two tabs: how it was handed over is on the storage's, not here */
  tabbed: boolean
}) => {
  const model = useBoard()
  if (!isMontage(group)) return null
  const facts = model.board.montageFacts[group.id]
  const editLocked = EDIT_LOCKED
  return (
    <div className='mb-2 flex flex-col gap-3'>
      {!tabbed && <HandedOver group={group} />}
      {withFilm && !group.uploaded && (
        <FilmStrip
          facts={facts}
          picture={filmPicture(group)}
        />
      )}
      {!group.uploaded && <FilmNote locked={model.frozen.has(group.id) ? editLocked : null} />}
    </div>
  )
}

/* A montage's two ways back, for all of it — each asks first — last in the panel at the right, out of the
   way of the page's own steps */
const MontageEnd = ({ who }: { who: string }) => {
  const { board, setDialog } = useBoard()
  const busy = board.busy !== null
  const theirs = board.groups.filter((g) => passengerOf(g) === who)
  if (theirs.length === 0 || theirs.some((g) => g.freed)) return null
  return (
    <Part>
      <span className='flex flex-wrap items-center gap-2'>
        <Mini
          disabled={busy}
          title={t`Back to before processing — keeps the name, the trims, the frames and the times`}
          onClick={() => setDialog({ kind: 'take-back', mode: 'reset', who })}>
          {t`Reset…`}
        </Mini>
        <Danger
          size='mini'
          disabled={busy}
          title={t`Undo the montage, at any step — its files go back to Fresh files, loose, without their name or trims`}
          onClick={() => setDialog({ kind: 'take-back', mode: 'delete', who })}>
          {t`Delete montage…`}
        </Danger>
      </span>
    </Part>
  )
}

/* a white card of the montage's page, headed by what it is about */
const Card = ({
  icon,
  title,
  aside,
  children
}: {
  icon: 'monitor' | 'storage'
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
}) => (
  <section className='flex min-h-0 flex-col gap-3 overflow-hidden rounded-panel bg-pane p-5 shadow-hairline'>
    <div className='flex items-center gap-3'>
      <Icon
        name={icon}
        size={20}
        className={icon === 'storage' ? 'text-accent' : 'text-ink-3'}
      />
      <h3 className='m-0 font-display text-subhead font-semibold tracking-title'>{title}</h3>
      {aside && <span className='ml-auto'>{aside}</span>}
    </div>
    {children}
  </section>
)

const SAFE =
  'inline-flex h-6 items-center rounded-full bg-up-soft px-2.5 text-small font-bold text-up'

/* the day the jump was, as the page's line says it */
const jumpDay = (group: ManifestGroup) => dayLabel(dayOf(group))

/* The line under a montage's name: what the jump is while there is work to do, where it has got to once
   it is on the storage, and the whole story once it is done. */
const montageSub = (group: ManifestGroup, emailedAt: number | null) => {
  const day = jumpDay(group)
  if (group.freed) {
    const delivered = group.uploaded ? shortDate(group.uploaded.at) : ''
    const freed = dayShort(group.freed.at)
    return emailedAt
      ? t`All done — delivered ${delivered}, emailed ${shortDate(emailedAt)}, freed ${freed}`
      : t`Freed from this machine ${freed}`
  }
  if (group.uploaded) return t`Jump of ${day} · delivered ${dayShort(group.uploaded.at)}`
  const videos = group.files.filter((f) => isVideoFile(f.path)).length
  const what = kindsSaid(videos, group.files.length - videos, ' · ')
  const size = formatSize(group.files.reduce((n, f) => n + f.size, 0))
  return t`Jump of ${day} · ${what} · ${size}`
}

/* What is here and what is up there, side by side, once the montage has been delivered; and once it is
   freed, what is left of it — only the storage's. */
const MontageBody = ({
  group,
  stamp,
  onProblem
}: {
  group: ManifestGroup
  stamp?: unknown
  onProblem?: (problem: string) => void
}) => {
  const model = useBoard()
  const { board } = model
  if (!group.uploaded) return null
  const gone = (model.goneById[group.id] ?? []).length > 0
  const parcels = parcelsOfGroup(group, board.places)
  const items = parcels.flatMap((p) => p.items)
  const stored = items.reduce((n, item) => n + (item.size ?? 0), 0)
  const shareUrl = group.uploaded.shareUrl ?? group.publish?.shareUrl
  const storage = (
    <StorageCards
      where={{ groupId: group.id }}
      stamp={stamp}
      onProblem={onProblem}
      quiet>
      {(itemActions) => (
        <HandedOver
          group={group}
          itemActions={itemActions}
          quiet
        />
      )}
    </StorageCards>
  )
  if (group.freed) {
    const emailed = model.emailedOn(group)
    const bytes = formatSize(group.freed.bytes)
    return (
      <div className='flex flex-col gap-4 pb-6'>
        <div className='grid grid-cols-3 gap-3.5'>
          <div className='rounded-panel bg-pane px-4.5 py-4 shadow-hairline'>
            <div className='eyebrow'>{t`Stored`}</div>
            <div className='mt-0.5 font-display text-display font-semibold tracking-display'>
              {plural(items.length, { one: '# item', other: '# items' })}
            </div>
            <div className='text-small text-ink-3'>{t`${formatSize(stored)} on the storage`}</div>
          </div>
          <div className='rounded-panel bg-pane px-4.5 py-4 shadow-hairline'>
            <div className='eyebrow'>{t`Link`}</div>
            <div className='mt-1.5 flex items-center gap-2'>
              <span
                className={
                  shareUrl
                    ? SAFE
                    : 'inline-flex h-6 items-center rounded-full bg-well px-2.5 text-small font-bold text-ink-2'
                }>
                {shareUrl ? t`active` : t`no link`}
              </span>
              {shareUrl && (
                <span className='truncate font-mono text-small text-ink-3'>
                  …/{shareUrl.split('/').pop()}
                </span>
              )}
            </div>
            {emailed && (
              <div className='mt-1 text-small text-ink-3'>
                {t`emailed ${shortDate(emailed.at)}`}
              </div>
            )}
          </div>
          <div className='rounded-panel bg-pane px-4.5 py-4 shadow-hairline'>
            <div className='eyebrow'>{t`This machine`}</div>
            <div className='mt-0.5 font-display text-display font-semibold tracking-display'>
              {t`Empty`}
            </div>
            <div className='text-small text-ink-3'>{t`freed ${bytes} on ${shortDate(group.freed.at)}`}</div>
          </div>
        </div>
        <Card
          icon='storage'
          title={t`Only on the storage now`}
          aside={<span className='text-small text-ink-3'>{t`press a zip to see inside`}</span>}>
          {storage}
        </Card>
      </div>
    )
  }
  const videos = group.files.filter((f) => isVideoFile(f.path)).length
  return (
    <div className='flex flex-col gap-4 pb-6'>
      <MontageActions group={group} />
      <div
        className='grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-4.5 max-roomy:grid-cols-1'
        style={{ minHeight: 'calc(100vh - 470px)' }}>
        <Card
          icon='monitor'
          title={t`On this machine`}>
          <div>
            <div className='font-display text-display leading-title font-semibold tracking-display'>
              {formatSize(group.files.reduce((n, f) => n + f.size, 0))}
            </div>
            <div className='text-small text-ink-3'>
              {kindsSaid(videos, group.files.length - videos, ' · ')}
            </div>
          </div>
          {!gone && (
            <div className='flex items-start gap-2.5 rounded-card bg-well px-3.5 py-3 text-body'>
              <Icon
                name='check'
                size={18}
                weight={2.4}
                className='flex-none text-up'
              />
              <span>{t`Everything here is also on the storage.`}</span>
            </div>
          )}
          <div className='mt-auto'>
            <Mini
              disabled={board.busy !== null}
              title={t`Delete it from this machine — only once the storage is proved to hold every file`}
              onClick={() => model.setDialog({ kind: 'free', groupId: group.id })}>
              {t`Free up space…`}
            </Mini>
            <p className='m-0 mt-1.5 text-small text-ink-3'>
              {t`Deletes what is here once the storage is proved to hold it. Asks first.`}
            </p>
          </div>
        </Card>
        <Card
          icon='storage'
          title={t`On the storage`}
          aside={!gone && <span className={SAFE}>{t`safe`}</span>}>
          {storage}
        </Card>
      </div>
    </div>
  )
}

/* What else can be done to a montage, kept out of the way of the one next step: the page's ⋯ menu. */
const MontageMenu = ({
  group,
  close,
  trimToJump
}: {
  group: ManifestGroup
  close: () => void
  trimToJump?: () => void
}) => {
  const model = useBoard()
  const { board } = model
  const facts = board.montageFacts[group.id]
  const busy = board.busy !== null
  const firstname = group.passenger?.firstname ?? ''
  const emailed = model.emailedOn(group)
  const linked = Boolean(group.uploaded?.shareUrl ?? group.publish?.shareUrl)
  const act = (run: () => void) => () => {
    run()
    close()
  }
  return (
    <div className='flex flex-col'>
      {linked && !group.freed && (
        <MenuItem
          icon='mail'
          onClick={act(() => model.setDialog({ kind: 'email', groupId: group.id }))}>
          {emailed ? t`✓ Emailed · again…` : t`Email ${firstname}…`}
        </MenuItem>
      )}
      {facts?.project && !group.freed && (
        <MenuItem
          icon='open'
          disabled={busy}
          onClick={act(() => model.takeStep(group, 'Rendered'))}>
          {t`Open in kdenlive`}
        </MenuItem>
      )}
      {group.processed && !group.freed && (
        <MenuItem
          icon='scan'
          disabled={busy}
          title={t`Make the copies again from the originals — the project, the film and the archives are left alone`}
          onClick={act(() => model.takeStep(group, 'Processed'))}>
          {t`Process again`}
        </MenuItem>
      )}
      {facts?.film && !group.freed && (
        <MenuItem
          icon='upload'
          disabled={busy}
          onClick={act(() => model.takeStep(group, 'Uploaded'))}>
          {model.asOnStorage(group).uploaded ? t`Upload again…` : t`Upload…`}
        </MenuItem>
      )}
      {group.uploaded && !group.freed && (
        <MenuItem
          icon='eject'
          disabled={busy}
          onClick={act(() => model.setDialog({ kind: 'free', groupId: group.id }))}>
          {t`Free up space…`}
        </MenuItem>
      )}
      {trimToJump && !group.freed && (
        <MenuItem
          icon='scissors'
          onClick={act(trimToJump)}>
          {t`Trim every clip to the jump`}
        </MenuItem>
      )}
      {!group.freed && (
        <MenuItem
          icon='back'
          disabled={busy}
          title={t`Back to before processing — keeps the name, the trims, the frames and the times`}
          onClick={act(() =>
            model.setDialog({ kind: 'take-back', mode: 'reset', who: passengerOf(group) })
          )}>
          {t`Reset…`}
        </MenuItem>
      )}
      {!group.freed && (
        <MenuItem
          icon='bin'
          danger
          disabled={busy}
          title={t`Undo the montage, at any step — its files go back to Fresh files, loose, without their name or trims`}
          onClick={act(() =>
            model.setDialog({ kind: 'take-back', mode: 'delete', who: passengerOf(group) })
          )}>
          {t`Delete montage…`}
        </MenuItem>
      )}
      {facts?.project && (
        <MenuItem
          icon='project'
          onClick={act(
            () => void navigator.clipboard?.writeText(facts.projectPath).catch(() => undefined)
          )}>
          {t`Copy the project’s path`}
        </MenuItem>
      )}
    </div>
  )
}

/* the whole way done, as six small ticks joined up, at the far end of a finished montage's name */
const WayDone = () => (
  <span
    aria-hidden='true'
    className='flex items-center gap-1'>
    {[0, 1, 2, 3, 4, 5].map((n) => (
      <span
        key={n}
        className='flex items-center gap-1'>
        <span className='grid size-mark place-items-center rounded-full bg-up text-white'>
          <Icon
            name='check'
            size={10}
            weight={4}
          />
        </span>
        {n < 5 && <span className='h-0.75 w-3.5 rounded-bar bg-up' />}
      </span>
    ))}
  </span>
)

export {
  MontageBody,
  MontageMenu,
  WayDone,
  montageSub,
  HandedOver,
  MontageAbove,
  MontageActions,
  MontageEnd
}
