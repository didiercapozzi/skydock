import { useEffect, useState } from 'react'
import {
  cameraDeletedSchema,
  camerasAnswerSchema
} from '../../../packages/skydock-scripts/src/cameraEntry'
import type { CameraFile, CameraListing } from '../../../packages/skydock-scripts/src/cameraEntry'
import { routingEngine } from '../helpers/routing'
import { refusalSchema } from '../hooks/useBoardState'
import { Go, Mini } from './buttons'
import { Modal, Spacer } from './modal'
import { dateLabel, formatFilmSize, formatSize, hhmm, plural } from './utils'

/* What is on a camera plugged in (RULES, Seeing what is on a camera): every file on its card, and
   how far it has got — not copied yet, copied here, put in the bin once copied, or on the storage
   too. Only a file on the storage or in the bin can be picked, and deleting asks first: each is
   proved, by its bytes, to be what the storage holds or its copy in the bin before it leaves the
   card, and goes to the bin. */

/* how far a camera file has got, as each row says it */
const STANDING = {
  stored: {
    label: 'on the storage',
    tone: 'bg-up-soft text-up',
    title: 'Copied here and on the storage — can be deleted from the camera'
  },
  copied: {
    label: 'copied, not uploaded',
    tone: 'bg-line-2 text-ink-2',
    title:
      'Copied here, not on the storage yet — upload it, or put it in the bin, before deleting it from the camera'
  },
  binned: {
    label: 'in the bin',
    tone: 'bg-line-2 text-ink-2',
    title: 'Copied here and then put in the bin — can be deleted from the camera'
  },
  missing: {
    label: 'not copied yet',
    tone: 'bg-local-soft text-local',
    title: 'Not copied here yet — it cannot be deleted from the camera'
  }
}

const counted = (files: CameraFile[], state: CameraFile['state'], what: string) => {
  const n = files.filter((f) => f.state === state).length
  return n > 0 ? ` · ${n} ${what}` : ''
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
}) => (
  <Modal
    label='Delete from the camera'
    title={`Delete from ${camera}`}
    onClose={onClose}
    footer={
      <>
        <Spacer />
        <Mini onClick={onClose}>Close</Mini>
        <Go onClick={onConfirm}>Check and delete {plural(files.length, 'file')} from the camera</Go>
      </>
    }>
    <p className='m-0 text-[12.5px] text-ink-2'>
      {plural(files.length, 'file')} — {formatFilmSize(files.reduce((n, f) => n + f.size, 0))} —
      come off the camera’s card. Each is first read through and matched, by its bytes and not its
      name, with what the storage holds or with its copy in the bin; if any one does not match,
      nothing at all is deleted, and it says which.
    </p>
    <p className='m-0 rounded-r-md border-l-[3px] border-local bg-local-soft px-3 py-[9px] text-[12px] text-ink-2'>
      They are not erased: they go to the bin, <span className='font-mono'>.trash/</span>, kept as
      they sat on the card, and stay there until it is emptied by hand.
    </p>
  </Modal>
)

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
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [asking, setAsking] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copying, setCopying] = useState(false)
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
          setProblem('What is on the camera could not be read.')
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
        if (!cancelled) setProblem('What is on the camera could not be read.')
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
  const files = listing?.files ?? []
  /* what can be picked is what could be deleted: what is on the storage or in the bin — nothing, on
     a camera read through KDE */
  const pickable = listing?.deletable
    ? files.filter((f) => f.state === 'stored' || f.state === 'binned')
    : []
  const chosen = pickable.filter((f) => picked.has(f.path))
  const stored = files.filter((f) => f.state === 'stored')
  const missing = files.filter((f) => f.state === 'missing')
  /* only a file on the storage can have been given back, so only those are copied back here */
  const toCopyBack = chosen.filter((f) => f.state === 'stored')

  const toggle = (file: CameraFile) => {
    const next = new Set(picked)
    if (next.has(file.path)) next.delete(file.path)
    else next.add(file.path)
    setPicked(next)
  }

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
      setProblem(refused.data.globalErrors?.[0] ?? 'The camera could not be copied.')
    else onNote(`Copying ${listing?.camera ?? 'the camera'} — the header shows how far it has got.`)
  }

  const deleteChosen = async () => {
    setAsking(false)
    setDeleting(true)
    setProblem(null)
    const raw = await routingEngine
      .action({ url: '/api/camera', actionArgs: { paths: chosen.map((f) => f.path) } })
      .catch(() => null)
    setDeleting(false)
    const done = cameraDeletedSchema.safeParse(raw)
    if (done.success) {
      setAnswered({ mount, listing: done.data.cameras.find((c) => c.mount === mount) ?? null })
      setPicked(new Set())
      onNote(
        `${plural(done.data.deleted.count, 'file')} deleted from the camera — ${formatFilmSize(done.data.deleted.bytes)} — and put in the bin.`
      )
      return
    }
    const refused = refusalSchema.safeParse(raw)
    setProblem(
      refused.success
        ? (refused.data.globalErrors?.[0] ?? 'Nothing was deleted.')
        : 'Nothing was deleted.'
    )
  }

  return (
    <section
      aria-label='On the camera'
      className='pt-3'>
      <div className='flex flex-wrap items-center gap-2 px-0.5 pb-1.5'>
        {listing && (
          <span className='text-[12px] text-ink-2'>
            {plural(files.length, 'file')} · {stored.length} on the storage
            {counted(files, 'copied', 'copied here, not uploaded yet')}
            {counted(files, 'binned', 'in the bin')}
            {counted(files, 'missing', 'not copied yet')}
          </span>
        )}
        {/* a camera still being gone over is being copied already */}
        {missing.length > 0 && !looking && (
          <Mini
            disabled={copying}
            title='Copy what is not on this machine yet, without unplugging the camera — what is here already is passed over'
            onClick={() => void copyAgain()}>
            {copying ? 'Asking…' : `Copy ${plural(missing.length, 'file')} here`}
          </Mini>
        )}
        {looking && (
          <span
            title='SkyDock is going over the camera, file by file, as it copies it. What it has been over is listed here; the rest follow on their own.'
            className='rounded-full border border-accent bg-accent-soft px-2.5 py-px text-[11.5px] font-semibold text-accent'>
            still going over the camera — {plural(files.length, 'file')} so far
          </span>
        )}
        {/* A camera with no drive to offer is read a request at a time. It works, and it is the
            same speed the file manager gets, but it is worth saying why it is not the speed of the
            same card in a reader. */}
        {listing?.over === 'mtp' && (
          <span
            title='This camera hands its files over one request at a time rather than showing its card as a drive. Everything works; it is slower than the same card in a reader, which is worth knowing before a full card.'
            className='rounded-full border border-local bg-local-soft px-2.5 py-px text-[11.5px] font-semibold text-local'>
            handed over, not a drive — slower than a card reader
          </span>
        )}
        <Spacer />
        {listing && !listing.deletable && (
          <span
            title='Deleting proves each file against the storage by reading it through, byte for byte, which needs the camera readable as files. Delete them on the camera itself.'
            className='text-[11.5px] text-ink-3'>
            copied off and listed here — delete on the camera itself
          </span>
        )}
        {pickable.length > 0 && (
          <Mini
            onClick={() =>
              setPicked(
                chosen.length === pickable.length ? new Set() : new Set(pickable.map((f) => f.path))
              )
            }>
            {chosen.length === pickable.length ? 'Pick none' : 'Pick every file that can go'}
          </Mini>
        )}
        {toCopyBack.length > 0 && (
          <Mini
            title='Copy these back onto this machine — the one way back from having given them back'
            onClick={() => {
              onCopyBack(toCopyBack.map((f) => f.path))
              setPicked(new Set())
              setReadAgain((n) => n + 1)
            }}>
            {`Copy ${plural(toCopyBack.length, 'file')} back here`}
          </Mini>
        )}
        {listing?.deletable !== false && (
          <Go
            disabled={chosen.length === 0 || deleting}
            onClick={() => setAsking(true)}>
            {deleting
              ? 'Checking and deleting…'
              : chosen.length > 0
                ? `Delete ${plural(chosen.length, 'file')} from the camera…`
                : 'Delete from the camera…'}
          </Go>
        )}
      </div>
      {problem && (
        <p
          role='alert'
          className='m-0 mb-2 rounded-md bg-local-soft px-3 py-2 text-[12.5px] text-local'>
          {problem}
        </p>
      )}
      {answered === null && !problem ? (
        <p className='m-0 px-0.5 text-[12.5px] text-ink-3'>Reading the camera…</p>
      ) : listing === null ? (
        <p className='m-0 rounded-md bg-local-soft px-3 py-2 text-[12.5px] text-local'>
          This camera is not plugged in any more.
        </p>
      ) : files.length === 0 && listing ? (
        <p className='m-0 rounded-[9px] border border-dashed border-line px-3 py-4 text-center text-[12.5px] text-ink-3'>
          {looking
            ? 'Going over the camera — its files appear here as they are reached.'
            : 'Nothing on the camera’s card.'}
        </p>
      ) : (
        <ul className='m-0 flex list-none flex-col gap-px rounded-lg border border-line bg-pane p-[7px]'>
          {files.map((file) => (
            <li key={file.path}>
              <label
                title={STANDING[file.state].title}
                className={`flex h-[34px] w-full items-center gap-2.5 rounded-md px-[7px] ${
                  pickable.includes(file) ? 'cursor-pointer hover:bg-line-2' : ''
                }`}>
                {/* only a file on the storage or in the bin has a tick: nothing else could go */}
                <span className='w-4 flex-none'>
                  {pickable.includes(file) && (
                    <input
                      type='checkbox'
                      aria-label={`Pick ${file.name}`}
                      checked={picked.has(file.path)}
                      onChange={() => toggle(file)}
                    />
                  )}
                </span>
                <span className='min-w-0 flex-1 truncate font-mono text-[12px] text-ink'>
                  {file.name}
                </span>
                <span
                  className={`flex-none rounded-full px-[7px] py-px text-[11px] font-semibold whitespace-nowrap ${STANDING[file.state].tone}`}>
                  {STANDING[file.state].label}
                </span>
                <span className='w-[150px] flex-none text-right font-mono text-[11px] text-ink-3 tabular-nums'>
                  {/* a camera that gives no time for a file it has not handed over yet */}
                  {file.mtime > 0 ? `${dateLabel(file.mtime)} ${hhmm(file.mtime)}` : '—'}
                </span>
                <span className='w-[64px] flex-none text-right font-mono text-[11px] text-ink-3 tabular-nums'>
                  {formatSize(file.size)}
                </span>
              </label>
            </li>
          ))}
        </ul>
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
