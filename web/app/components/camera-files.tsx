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
   how far it has got — not copied yet, copied here, or on the storage too. Only a file on the storage
   can be picked, and deleting asks first: each is proved, by its bytes, to be what the storage holds
   before it leaves the card, and goes to the bin. */

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
    title: 'Copied here, not on the storage yet — upload it before deleting it from the camera'
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
      name, with what the storage holds; if any one does not match, nothing at all is deleted, and
      it says which.
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
  onNote
}: {
  mount: string
  /* changes when the cameras plugged in change, which is when the card is worth reading again */
  stamp: unknown
  onNote: (note: string) => void
}) => {
  const [answered, setAnswered] = useState<{ mount: string; listing: CameraListing | null } | null>(
    null
  )
  const [problem, setProblem] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [asking, setAsking] = useState(false)
  const [deleting, setDeleting] = useState(false)

  /* the card is another drive, read once when the page opens and again when a camera comes or goes */
  useEffect(() => {
    let cancelled = false
    routingEngine
      .loader({ url: '/api/camera' })
      .then((raw) => {
        const parsed = camerasAnswerSchema.safeParse(raw)
        if (cancelled) return
        if (!parsed.success) setProblem('What is on the camera could not be read.')
        else
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
  }, [mount, stamp])

  /* a listing of another camera is no listing of this one */
  const listing = answered?.mount === mount ? answered.listing : undefined
  const files = listing?.files ?? []
  const stored = files.filter((f) => f.state === 'stored')
  const chosen = stored.filter((f) => picked.has(f.path))

  const toggle = (file: CameraFile) => {
    const next = new Set(picked)
    if (next.has(file.path)) next.delete(file.path)
    else next.add(file.path)
    setPicked(next)
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
            {counted(files, 'missing', 'not copied yet')}
          </span>
        )}
        <Spacer />
        {stored.length > 0 && (
          <Mini
            onClick={() =>
              setPicked(
                chosen.length === stored.length ? new Set() : new Set(stored.map((f) => f.path))
              )
            }>
            {chosen.length === stored.length ? 'Pick none' : 'Pick every file on the storage'}
          </Mini>
        )}
        <Go
          disabled={chosen.length === 0 || deleting}
          onClick={() => setAsking(true)}>
          {deleting
            ? 'Checking and deleting…'
            : chosen.length > 0
              ? `Delete ${plural(chosen.length, 'file')} from the camera…`
              : 'Delete from the camera…'}
        </Go>
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
          Nothing on the camera’s card.
        </p>
      ) : (
        <ul className='m-0 flex list-none flex-col gap-px rounded-lg border border-line bg-pane p-[7px]'>
          {files.map((file) => (
            <li key={file.path}>
              <label
                title={STANDING[file.state].title}
                className={`flex h-[34px] w-full items-center gap-2.5 rounded-md px-[7px] ${
                  file.state === 'stored' ? 'cursor-pointer hover:bg-line-2' : ''
                }`}>
                {/* only a file on the storage has a tick: nothing else could be deleted for it */}
                <span className='w-4 flex-none'>
                  {file.state === 'stored' && (
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
                  {dateLabel(file.mtime)} {hhmm(file.mtime)}
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
