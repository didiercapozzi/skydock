import { plural, t } from '@lingui/core/macro'
import { useEffect, useState } from 'react'
import { binAnswerSchema } from '../../../packages/skydock-scripts/src/binEntry'
import type { BinBatch, BinFile } from '../../../packages/skydock-scripts/src/binEntry'
import { isVideoFile } from '@skydock/scripts'
import { routingEngine } from '../helpers/routing'
import { Go } from './buttons'
import { Spacer } from './modal'
import { dateLabel, formatSize, getThumbUrl, hhmm } from './utils'

/* What the bin holds (RULES, Putting files in the bin): every file put aside, by when and from
   where, to be looked through and brought back to Fresh files. Nothing is deleted from here — the
   bin is emptied by hand, from the machine's own folders, or not at all. */

const fromWhere = (batch: BinBatch) => {
  const camera = batch.camera
  const montage = batch.montage
  const dropzone = batch.dropzone ?? ''
  return batch.from === 'fresh'
    ? t`Put in the bin from Fresh files`
    : batch.from === 'dropzone'
      ? t`Taken out of the dropzone ${dropzone}`
      : batch.from === 'montage'
        ? montage
          ? t`Taken out of the montage ${montage}`
          : t`Taken out of a montage`
        : batch.from === 'camera'
          ? camera
            ? t`Deleted from the camera ${camera}`
            : t`Deleted from the camera`
          : batch.folder
}

/* a file's box, read out */
const pickLabel = (name: string) => t`Pick ${name}`

const BinFiles = ({
  stamp,
  bringing,
  onBringBack
}: {
  /* changes whenever the board answers, which is when the bin may have changed */
  stamp: unknown
  /* files are on their way back — moved, then scanned, which takes a moment on a full disk */
  bringing: boolean
  onBringBack: (paths: string[]) => void
}) => {
  const [answered, setAnswered] = useState<{ dir: string; batches: BinBatch[] } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  /* what was asked back leaves the list at once, not once the scan behind it is done */
  const [asked, setAsked] = useState<Set<string>>(new Set())

  /* Read when the page opens, and again once files have come back — never while they are on their
     way, when the bin is half moved. */
  useEffect(() => {
    if (bringing) return
    let cancelled = false
    routingEngine
      .loader({ url: '/api/bin' })
      .then((raw) => {
        if (cancelled) return
        const parsed = binAnswerSchema.safeParse(raw)
        if (parsed.success) {
          setAnswered(parsed.data)
          setAsked(new Set())
        } else setProblem(t`What is in the bin could not be read.`)
      })
      .catch(() => {
        if (!cancelled) setProblem(t`What is in the bin could not be read.`)
      })
    return () => {
      cancelled = true
    }
  }, [stamp, bringing])

  const batches = (answered?.batches ?? [])
    .map((batch) => ({ ...batch, files: batch.files.filter((f) => !asked.has(f.path)) }))
    .filter((batch) => batch.files.length > 0)
  const files = batches.flatMap((b) => b.files)
  const chosen = files.filter((f) => picked.has(f.path))
  const count = files.length
  const picks = chosen.length
  const toggle = (file: BinFile) => {
    const next = new Set(picked)
    if (next.has(file.path)) next.delete(file.path)
    else next.add(file.path)
    setPicked(next)
  }

  return (
    <section
      aria-label={t`In the bin`}
      className='pt-3'>
      <div className='flex flex-wrap items-center gap-2 px-0.5 pb-1.5'>
        {answered && (
          <span className='text-[12px] text-ink-2'>
            {plural(count, { one: '# file', other: '# files' })} ·{' '}
            {formatSize(files.reduce((n, f) => n + f.size, 0))}
          </span>
        )}
        <Spacer />
        <Go
          disabled={chosen.length === 0 || bringing}
          title={t`Back into the originals, under the day each was shot, and into Fresh files`}
          onClick={() => {
            const paths = chosen.map((f) => f.path)
            onBringBack(paths)
            setAsked(new Set([...asked, ...paths]))
            setPicked(new Set())
          }}>
          {bringing
            ? t`Bringing back…`
            : chosen.length > 0
              ? t`Bring ${plural(picks, { one: '# file', other: '# files' })} back to Fresh files`
              : t`Bring back to Fresh files`}
        </Go>
      </div>
      {answered && (
        <p className='m-0 mb-2 rounded-r-md border-l-[3px] border-line bg-line-2 px-3 py-[9px] text-[12px] text-ink-2'>
          {t`SkyDock never empties the bin. To delete these files for good, remove them yourself from`}{' '}
          <code className='font-mono break-all text-ink'>{answered.dir}</code>
        </p>
      )}
      {problem && (
        <p
          role='alert'
          className='m-0 mb-2 rounded-md bg-local-soft px-3 py-2 text-[12.5px] text-local'>
          {problem}
        </p>
      )}
      {answered === null && !problem ? (
        <p className='m-0 px-0.5 text-[12.5px] text-ink-3'>{t`Looking in the bin…`}</p>
      ) : answered && batches.length === 0 ? (
        <p className='m-0 rounded-[9px] border border-dashed border-line px-3 py-4 text-center text-[12.5px] text-ink-3'>
          {t`The bin is empty.`}
        </p>
      ) : (
        batches.map((batch) => (
          <div
            key={batch.folder}
            className='mb-3'>
            <h3 className='m-0 px-0.5 pb-1 text-[12px] font-semibold text-ink-2'>
              {fromWhere(batch)} · {dateLabel(batch.at)} {hhmm(batch.at)}
            </h3>
            <ul className='m-0 flex list-none flex-col gap-px rounded-lg border border-line bg-pane p-[7px]'>
              {batch.files.map((file) => (
                <li key={file.path}>
                  <label className='flex h-[44px] w-full cursor-pointer items-center gap-2.5 rounded-md px-[7px] hover:bg-line-2'>
                    <input
                      type='checkbox'
                      aria-label={pickLabel(file.name)}
                      checked={picked.has(file.path)}
                      onChange={() => toggle(file)}
                    />
                    <img
                      src={getThumbUrl(file.path, isVideoFile(file.path) ? 1 : 0, 64)}
                      alt=''
                      loading='lazy'
                      decoding='async'
                      className='h-9 w-16 flex-none rounded bg-line-2 object-cover'
                    />
                    <span className='min-w-0 flex-1 truncate font-mono text-[12px] text-ink'>
                      {file.name}
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
          </div>
        ))
      )}
    </section>
  )
}

export { BinFiles }
