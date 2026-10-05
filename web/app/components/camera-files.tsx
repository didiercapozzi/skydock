import { i18n } from '@lingui/core'
import { msg, plural, t } from '@lingui/core/macro'
import { useEffect, useState } from 'react'
import {
  cameraDeletedSchema,
  camerasAnswerSchema
} from '../../../packages/skydock-scripts/src/cameraEntry'
import type { CameraFile, CameraListing } from '../../../packages/skydock-scripts/src/cameraEntry'
import { routingEngine } from '../helpers/routing'
import { forgetJobsOf, useJobRow, useJobRows } from '../hooks/liveStore'
import { usePicked } from '../hooks/usePicked'
import { refusalSchema } from '../hooks/useBoardState'
import { CameraPreview, previewable } from './camera-preview'
import { Go, Mini, ToBin } from './buttons'
import { Empty, Looking, Problem } from './blurbs'
import { TD, TH, Tick } from './file-table'
import { Icon } from './icons'
import { Modal, Spacer } from './modal'
import { dateLabel, formatFilmSize, formatSize, hhmm } from './utils'

/* What is on a camera plugged in (RULES, Seeing what is on a camera): every file on its card, and
   how far it has got — not copied yet, copied here, put in the bin once copied, or on the storage
   too. Only a file on the storage or in the bin can be picked, and deleting asks first: each is
   proved, by its bytes, to be what the storage holds or its copy in the bin before it leaves the
   card, and goes to the bin. */

/* how far a camera file has got, as each row says it and as the count above the list says it —
   in the badge colours the board gives the same states of its own files */
const STANDING = {
  missing: {
    label: msg`not copied yet`,
    many: msg`not copied yet`,
    tone: 'bg-changed-soft text-changed before:shadow-ring-current',
    ink: 'text-accent',
    title: msg`Not copied here yet — it cannot be deleted from the camera`
  },
  copied: {
    label: msg`copied, not uploaded`,
    many: msg`here, not uploaded`,
    tone: 'bg-local-soft text-local before:bg-current',
    ink: 'text-local',
    title: msg`Copied here, not on the storage yet — upload it, or put it in the bin, before deleting it from the camera`
  },
  binned: {
    label: msg`in the bin`,
    many: msg`here, put in the bin`,
    tone: 'bg-bin-soft text-bin before:bg-current',
    ink: 'text-bin',
    title: msg`Copied here and then put in the bin — can be deleted from the camera`
  },
  stored: {
    label: msg`on the storage`,
    many: msg`on the storage`,
    tone: 'bg-up-soft text-up before:bg-current',
    ink: 'text-up',
    title: msg`Copied here and on the storage — can be deleted from the camera`
  }
}

/* the order the count above the list reads in: from what is still to do to what is done */
const STATES = ['missing', 'copied', 'binned', 'stored'] as const

/* a file's box, read out */
const pickLabel = (name: string) => t`Pick ${name}`

/* how far a file being deleted has got: read through to be proved, then moved into the bin */
const DeleteBar = ({ path }: { path: string }) => {
  const live = useJobRow('camera-delete', path)
  const part = live?.part ?? 0
  const percent = Math.round(part * 100)
  const word =
    live?.phase === 'moving'
      ? t`Moving to the bin`
      : live?.phase === 'checked'
        ? t`Checked — waiting to move`
        : t`Checking`
  return (
    <span
      role='progressbar'
      aria-label={t`Deleting ${path}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className='flex w-full flex-col gap-1'>
      <span className='flex items-center justify-between text-micro font-bold text-accent-ink'>
        <span>{word}</span>
        <span className='tabular-nums'>{percent}%</span>
      </span>
      <span className='block h-1.5 overflow-hidden rounded-full bg-well'>
        <span
          className={`block h-full rounded-full bg-accent transition-[width] duration-150`}
          style={{ width: `${percent}%` }}
        />
      </span>
    </span>
  )
}

const Confirm = ({
  camera,
  files,
  onClose,
  onConfirm
}: {
  camera: string
  files: CameraFile[]
  onClose: () => void
  onConfirm: () => void
}) => {
  const count = files.length
  const size = formatFilmSize(files.reduce((n, f) => n + f.size, 0))
  return (
    <Modal
      label={t`Delete from the camera`}
      title={t`Delete from ${camera}`}
      onClose={onClose}
      footer={
        <>
          <Spacer />
          <Mini onClick={onClose}>{t`Cancel`}</Mini>
          <Go onClick={onConfirm}>
            {t`Check and delete ${plural(count, { one: '# file', other: '# files' })} from the camera`}
          </Go>
        </>
      }>
      <p className='m-0 text-body text-ink-2'>
        {t`${plural(count, { one: '# file', other: '# files' })} — ${size} — come off the camera’s card. Each is first read through and matched, by its bytes and not its name, with what the storage holds or with its copy in the bin; if any one does not match, nothing at all is deleted, and it says which.`}
      </p>
      <p className='m-0 rounded-control bg-local-soft px-3.5 py-2.5 text-small text-ink-2'>
        {t`They are not erased: they go to the bin,`} <span className='font-mono'>.trash/</span>
        {t`, kept as they sat on the card, and stay there until it is emptied by hand.`}
      </p>
    </Modal>
  )
}

const CameraFiles = ({
  mount,
  stamp,
  onNote,
  onCopyBack
}: {
  mount: string
  /* changes when the cameras plugged in change, or a copy starts or ends — which is when the card is
     worth reading again */
  stamp: unknown
  onNote: (note: string) => void
  /* files this machine gave back, wanted here again: the board copies them off and looks again */
  onCopyBack: (paths: string[]) => void
}) => {
  const [answered, setAnswered] = useState<{ mount: string; listing: CameraListing | null } | null>(
    null
  )
  const [problem, setProblem] = useState<string | null>(null)
  const { picked, setPicked, toggle } = usePicked()
  const [asking, setAsking] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copying, setCopying] = useState(false)
  /* the file being looked at from the card, by where it is on it */
  const [previewing, setPreviewing] = useState<string | null>(null)
  /* bumped when the card's files change under us, which is when it is worth reading again */
  const [readAgain, setReadAgain] = useState(0)

  /* the card is another drive, read once when the page opens and again when a camera comes or goes */
  useEffect(() => {
    let cancelled = false
    routingEngine
      .loader({ url: '/api/camera' })
      .then((raw) => {
        const parsed = camerasAnswerSchema.safeParse(raw)
        if (cancelled) return
        if (!parsed.success) {
          setProblem(t`What is on the camera could not be read.`)
          return
        }
        /* a read that worked puts right one that did not */
        setProblem(null)
        setAnswered({
          mount,
          listing: parsed.data.cameras.find((c) => c.mount === mount) ?? null
        })
      })
      .catch(() => {
        if (!cancelled) setProblem(t`What is on the camera could not be read.`)
      })
    return () => {
      cancelled = true
    }
  }, [mount, stamp, readAgain])

  /* a listing of another camera is no listing of this one */
  const listing = answered?.mount === mount ? answered.listing : undefined

  /* A camera still being gone over has more to come: it is looked at again every few seconds until
     it is all there. Only what the copy has already found is read, so looking again costs nothing
     of the camera. */
  const looking = listing?.looking === true
  useEffect(() => {
    if (!looking) return
    const again = setTimeout(() => setReadAgain((n) => n + 1), 3000)
    return () => clearTimeout(again)
  }, [looking, answered])
  /* a file leaves the list the moment it has gone, not when the whole delete is over */
  const gone = new Set(
    useJobRows('camera-delete').flatMap((row) => (row.at === 'done' ? [row.key] : []))
  )
  const files = (listing?.files ?? []).filter((f) => !gone.has(f.path))
  /* what can be picked is what could be deleted: what is on the storage or in the bin — nothing, on
     a camera read through KDE */
  const pickable = listing?.deletable
    ? files.filter((f) => f.state === 'stored' || f.state === 'binned')
    : []
  const missing = files.filter((f) => f.state === 'missing')
  /* a file not copied yet can be picked to be copied; one on the storage or in the bin, to be deleted */
  const canPick = new Set([...missing, ...pickable])
  const chosen = pickable.filter((f) => picked.has(f.path))
  const chosenToCopy = missing.filter((f) => picked.has(f.path))
  /* only a file on the storage can have been given back, so only those are copied back here */
  const toCopyBack = chosen.filter((f) => f.state === 'stored')
  /* named, so a translator reads what each one is */
  const count = files.length
  const size = formatSize(files.reduce((n, f) => n + f.size, 0))
  const pickedSize = formatSize(chosen.reduce((n, f) => n + f.size, 0))
  const toCopy = missing.length
  /* a camera read as a drive can be looked into; one that hands its files over cannot be read here */
  const lookable = listing?.over === 'drive' ? files.filter(previewable) : []
  const lookingAt = lookable.findIndex((f) => f.path === previewing)
  const backCount = toCopyBack.length
  const picks = chosen.length

  /* Copied again without unplugging it: what is here already is passed over, so only what is missing
     comes across. The header shows the copy, and the page reads the card again when it ends. */
  const copyAgain = async () => {
    setCopying(true)
    setProblem(null)
    const raw = await routingEngine
      .action({ url: '/api/camera', actionArgs: { copy: mount } })
      .catch(() => null)
    setCopying(false)
    const refused = refusalSchema.safeParse(raw)
    if (refused.success)
      setProblem(refused.data.globalErrors?.[0] ?? t`The camera could not be copied.`)
    else {
      const camera = listing?.camera ?? t`the camera`
      onNote(t`Copying ${camera} — the header shows how far it has got.`)
    }
  }

  /* one file looked at, copied from the preview */
  const copyOne = async (file: CameraFile) => {
    setPreviewing(null)
    setCopying(true)
    setProblem(null)
    const raw = await routingEngine
      .action({ url: '/api/camera', actionArgs: { copyFiles: { mount, paths: [file.path] } } })
      .catch(() => null)
    setCopying(false)
    const refused = refusalSchema.safeParse(raw)
    if (refused.success)
      setProblem(refused.data.globalErrors?.[0] ?? t`The files could not be copied.`)
    else {
      const camera = listing?.camera ?? t`the camera`
      onNote(t`Copying ${camera} — the header shows how far it has got.`)
    }
  }

  /* only the files picked, copied: the rest of what is new stays on the card */
  const copyChosen = async () => {
    setCopying(true)
    setProblem(null)
    const raw = await routingEngine
      .action({
        url: '/api/camera',
        actionArgs: { copyFiles: { mount, paths: chosenToCopy.map((f) => f.path) } }
      })
      .catch(() => null)
    setCopying(false)
    const refused = refusalSchema.safeParse(raw)
    if (refused.success)
      setProblem(refused.data.globalErrors?.[0] ?? t`The files could not be copied.`)
    else {
      setPicked(new Set())
      const camera = listing?.camera ?? t`the camera`
      onNote(t`Copying ${camera} — the header shows how far it has got.`)
    }
  }

  const deleteChosen = async () => {
    setAsking(false)
    setDeleting(true)
    setProblem(null)
    const raw = await routingEngine
      .action({ url: '/api/camera', actionArgs: { paths: chosen.map((f) => f.path) } })
      .catch(() => null)
    setDeleting(false)
    forgetJobsOf('camera-delete')
    const done = cameraDeletedSchema.safeParse(raw)
    if (done.success) {
      setAnswered({ mount, listing: done.data.cameras.find((c) => c.mount === mount) ?? null })
      setPicked(new Set())
      const deleted = done.data.deleted.count
      const size = formatFilmSize(done.data.deleted.bytes)
      onNote(
        t`${plural(deleted, { one: '# file', other: '# files' })} deleted from the camera — ${size} — and put in the bin.`
      )
      /* the others stayed on the card, and are named with why */
      const stayed = done.data.deleted.stayed ?? []
      if (stayed.length > 0) setProblem(stayed.map((s) => s.why).join('; '))
      return
    }
    const refused = refusalSchema.safeParse(raw)
    setProblem(
      refused.success
        ? (refused.data.globalErrors?.[0] ?? t`Nothing was deleted.`)
        : t`Nothing was deleted.`
    )
  }

  return (
    <section
      aria-label={t`On the camera`}
      className='flex flex-col gap-3'>
      {/* how far the card has got, counted — and, beside it, the one thing to do next about it */}
      {listing && (
        <div className='flex items-center rounded-card bg-well py-3.5'>
          {STATES.map((state, at) => (
            <span
              key={state}
              title={i18n._(STANDING[state].title)}
              className={`flex flex-col gap-0.5 px-5.5 text-small font-medium text-ink-3 ${at > 0 ? 'border-l border-line-2' : ''}`}>
              <b
                className={`font-display text-display leading-none font-bold tracking-display tabular-nums ${STANDING[state].ink}`}>
                {files.filter((f) => f.state === state).length}
              </b>{' '}
              {i18n._(STANDING[state].many)}
            </span>
          ))}
          <Spacer />
          {/* a camera still being gone over is being copied already */}
          {missing.length > 0 && !looking && (
            <span className='mr-3.5 flex items-center gap-2'>
              {chosenToCopy.length > 0 && (
                <Go
                  disabled={copying}
                  title={t`Copy only the files picked — the rest of what is new stays on the card`}
                  onClick={() => void copyChosen()}>
                  {t`Copy ${plural(chosenToCopy.length, { one: '# file', other: '# files' })} selected`}
                </Go>
              )}
              <Go
                disabled={copying}
                title={t`Copy what is not on this machine yet, without unplugging the camera — what is here already is passed over`}
                onClick={() => void copyAgain()}>
                {copying
                  ? t`Asking…`
                  : t`Copy ${plural(toCopy, { one: '# file', other: '# files' })} here`}
              </Go>
            </span>
          )}
        </div>
      )}
      <div className='flex min-h-control-sm flex-wrap items-center gap-2'>
        {listing && (
          <span className='text-lead font-medium text-ink-3'>
            {plural(count, { one: '# file', other: '# files' })} · {size}
          </span>
        )}
        {looking && (
          <span
            title={t`SkyDock is going over the camera, file by file, as it copies it. What it has been over is listed here; the rest follow on their own.`}
            className='inline-flex h-chip items-center rounded-full bg-accent-soft px-2.5 text-micro font-bold text-accent-ink'>
            {t`still going over the camera — ${plural(count, { one: '# file', other: '# files' })} so far`}
          </span>
        )}
        {/* A camera with no drive to offer is read a request at a time. It works, and it is the
            same speed the file manager gets, but it is worth saying why it is not the speed of the
            same card in a reader. */}
        {listing?.over === 'mtp' && (
          <span
            title={t`This camera hands its files over one request at a time rather than showing its card as a drive. Everything works; it is slower than the same card in a reader, which is worth knowing before a full card.`}
            className='inline-flex h-chip items-center rounded-full bg-local-soft px-2.5 text-micro font-bold text-local'>
            {t`handed over, not a drive — slower than a card reader`}
          </span>
        )}
        <Spacer />
        {picks > 0 && (
          <span className='text-body text-ink-2'>
            <b className='font-semibold text-ink'>{t`${picks} picked`}</b> · {pickedSize}
          </span>
        )}
        {missing.length > 0 && (
          <Mini
            title={t`Tick every file not copied yet, to copy them all — or tick the ones wanted one by one`}
            onClick={() => {
              const every = missing.every((f) => picked.has(f.path))
              setPicked(
                every
                  ? new Set([...picked].filter((p) => !missing.some((f) => f.path === p)))
                  : new Set([...picked, ...missing.map((f) => f.path)])
              )
            }}>
            {missing.every((f) => picked.has(f.path))
              ? t`Pick no new file`
              : t`Pick every new file`}
          </Mini>
        )}
        {pickable.length > 0 && (
          <Mini
            onClick={() =>
              setPicked(
                picks === pickable.length ? new Set() : new Set(pickable.map((f) => f.path))
              )
            }>
            {picks === pickable.length ? t`Pick none` : t`Pick every file that can go`}
          </Mini>
        )}
        {toCopyBack.length > 0 && (
          <Mini
            title={t`Copy these back onto this machine — the one way back from having given them back`}
            onClick={() => {
              onCopyBack(toCopyBack.map((f) => f.path))
              setPicked(new Set())
              setReadAgain((n) => n + 1)
            }}>
            <Icon
              name='back'
              size={13}
            />
            {t`Copy ${plural(backCount, { one: '# file', other: '# files' })} back here`}
          </Mini>
        )}
        {/* deleted from the card is put in the bin, so it is the bin's red button */}
        {listing?.deletable !== false && (
          <ToBin
            disabled={picks === 0 || deleting}
            onClick={() => setAsking(true)}>
            {deleting
              ? t`Checking and deleting…`
              : picks > 0
                ? t`Delete ${plural(picks, { one: '# file', other: '# files' })} from the camera…`
                : t`Delete from the camera…`}
          </ToBin>
        )}
      </div>
      {listing && (
        <p className='m-0 flex items-center gap-2.5 rounded-control bg-well px-3 py-2 text-body font-medium text-ink-2'>
          <Icon
            name='lock'
            size={14}
            className='text-ink-3'
          />
          {listing.deletable ? (
            <span>
              {t`Pick a file not copied yet to copy just that one. Only a file uploaded to the storage, or one whose copy here went in the bin, can be deleted — deleted files go to the bin, never erased.`}
            </span>
          ) : (
            <span
              title={t`Deleting proves each file against the storage by reading it through, byte for byte, which needs the camera readable as files. Delete them on the camera itself.`}>
              {t`copied off and listed here — delete on the camera itself`}
            </span>
          )}
        </p>
      )}
      {problem && <Problem>{problem}</Problem>}
      {answered === null && !problem ? (
        <Looking>{t`Reading the camera…`}</Looking>
      ) : listing === null ? (
        <Problem>{t`This camera is not plugged in any more.`}</Problem>
      ) : files.length === 0 && listing ? (
        <Empty>
          {looking
            ? t`Going over the camera — its files appear here as they are reached.`
            : t`Nothing on the camera’s card.`}
        </Empty>
      ) : (
        <table className='w-full table-fixed border-collapse text-body'>
          <thead>
            <tr>
              <th className={`${TH} w-9`} />
              <th className={TH}>{t`On the card`}</th>
              <th className={`${TH} w-40`}>{t`Shot`}</th>
              <th className={`${TH} w-21 text-right`}>{t`Size`}</th>
              <th className={`${TH} w-47.5`}>{t`Where it has got to`}</th>
              <th className={`${TH} w-14`} />
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr
                key={file.path}
                title={i18n._(STANDING[file.state].title)}
                /* the whole line picks, as a box's label would; the box itself answers its own click */
                onClick={(e) => {
                  if (canPick.has(file) && !(e.target instanceof HTMLInputElement))
                    toggle(file.path)
                }}
                className={
                  canPick.has(file)
                    ? `cursor-pointer ${picked.has(file.path) ? 'bg-accent-soft' : 'hover:bg-well'}`
                    : ''
                }>
                {/* a file not copied yet has a box to copy it, and one on the storage or in the bin to delete it */}
                <td className={TD}>
                  {canPick.has(file) && (
                    <Tick
                      label={pickLabel(file.name)}
                      checked={picked.has(file.path)}
                      onChange={() => toggle(file.path)}
                    />
                  )}
                </td>
                <td className={`${TD} truncate font-medium text-ink`}>{file.name}</td>
                <td className={`${TD} text-small text-ink-2 tabular-nums`}>
                  {/* a camera that gives no time for a file it has not handed over yet */}
                  {file.mtime > 0 ? `${dateLabel(file.mtime)} ${hhmm(file.mtime)}` : '—'}
                </td>
                <td className={`${TD} text-right text-small text-ink-2 tabular-nums`}>
                  {formatSize(file.size)}
                </td>
                <td className={TD}>
                  {deleting && chosen.includes(file) ? (
                    <DeleteBar path={file.path} />
                  ) : (
                    <span
                      className={`inline-flex h-chip w-max items-center gap-1.5 rounded-full px-2.25 text-micro font-bold before:size-1.5 before:rounded-full before:content-[''] ${STANDING[file.state].tone}`}>
                      <span className='inline-block first-letter:uppercase'>
                        {i18n._(STANDING[file.state].label)}
                      </span>
                    </span>
                  )}
                </td>
                <td className={`${TD} text-right`}>
                  {lookable.includes(file) && (
                    <button
                      type='button'
                      aria-label={t`Preview ${file.name}`}
                      title={t`Look at it from the card, without copying it`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setPreviewing(file.path)
                      }}
                      className='grid size-7 cursor-pointer place-items-center rounded-full border-0 bg-well text-ink-2 hover:bg-line'>
                      <Icon
                        name='play'
                        size={12}
                      />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {lookingAt >= 0 && (
        <CameraPreview
          files={lookable}
          at={lookingAt}
          onStep={(to) => setPreviewing(lookable[to]?.path ?? null)}
          onClose={() => setPreviewing(null)}
          onCopy={(file) => void copyOne(file)}
        />
      )}
      {asking && listing && (
        <Confirm
          camera={listing.camera}
          files={chosen}
          onClose={() => setAsking(false)}
          onConfirm={() => void deleteChosen()}
        />
      )}
    </section>
  )
}

export { CameraFiles }
