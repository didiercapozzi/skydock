import { plural, t } from '@lingui/core/macro'
import { useState } from 'react'
import { binAnswerSchema } from '../../../packages/skydock-scripts/src/binEntry'
import type { BinBatch } from '../../../packages/skydock-scripts/src/binEntry'
import { isVideoFile } from '@skydock/scripts'
import { usePicked } from '../hooks/usePicked'
import { useLoaded } from '../hooks/useLoaded'
import { Go } from './buttons'
import { Empty, Looking, Problem } from './blurbs'
import { FileGroup, FileRow, Thumb } from './file-row'
import { Icon } from './icons'
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
  const { picked, setPicked, toggle } = usePicked()
  /* what was asked back leaves the list at once, not once the scan behind it is done */
  const [asked, setAsked] = useState<Set<string>>(new Set())

  /* Read when the page opens, and again once files have come back — never while they are on their
     way, when the bin is half moved. */
  const { data: answered, problem } = useLoaded('/api/bin', binAnswerSchema, {
    failed: t`What is in the bin could not be read.`,
    skip: bringing,
    deps: [stamp],
    onData: () => setAsked(new Set())
  })

  const batches = (answered?.batches ?? [])
    .map((batch) => ({ ...batch, files: batch.files.filter((f) => !asked.has(f.path)) }))
    .filter((batch) => batch.files.length > 0)
  const files = batches.flatMap((b) => b.files)
  const chosen = files.filter((f) => picked.has(f.path))
  const count = files.length
  const picks = chosen.length

  return (
    <section
      aria-label={t`In the bin`}
      className='flex flex-col gap-3'>
      <div className='flex min-h-control-sm flex-wrap items-center gap-2'>
        {answered && (
          <span className='text-lead font-medium text-ink-3'>
            {plural(count, { one: '# file', other: '# files' })} ·{' '}
            {formatSize(files.reduce((n, f) => n + f.size, 0))}
          </span>
        )}
        <Spacer />
        {picks > 0 && (
          <span className='text-body text-ink-2'>
            <b className='font-semibold text-ink'>{t`${picks} picked`}</b> ·{' '}
            {formatSize(chosen.reduce((n, f) => n + f.size, 0))}
          </span>
        )}
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
        <p className='m-0 flex items-center gap-2.5 rounded-corner bg-well px-3 py-2 text-body font-medium text-ink-2'>
          <Icon
            name='bin'
            size={14}
            className='text-ink-3'
          />
          <span className='min-w-0'>
            {t`SkyDock never empties the bin. To delete these files for good, remove them yourself from`}{' '}
            <code className='font-mono text-small break-all text-ink'>{answered.dir}</code>
          </span>
        </p>
      )}
      {problem && <Problem>{problem}</Problem>}
      {answered === null && !problem ? (
        <Looking>{t`Looking in the bin…`}</Looking>
      ) : answered && batches.length === 0 ? (
        <Empty>{t`The bin is empty.`}</Empty>
      ) : (
        batches.map((batch) => (
          /* each time files were put aside is a run of its own, headed by where they came from */
          <FileGroup
            key={batch.folder}
            title={fromWhere(batch)}
            count={`${dateLabel(batch.at)} ${hhmm(batch.at)} · ${plural(batch.files.length, { one: '# file', other: '# files' })}`}>
            {batch.files.map((file) => (
              <FileRow
                key={file.path}
                /* the whole line picks, as a box's label would; the box itself answers its own click */
                onClick={() => toggle(file.path)}
                picked={picked.has(file.path)}
                pick={{ label: pickLabel(file.name), onPick: () => toggle(file.path) }}
                picture={<Thumb src={getThumbUrl(file.path, isVideoFile(file.path) ? 1 : 0, 64)} />}
                name={file.name}
                meta={
                  <span className='tabular-nums'>
                    {dateLabel(file.mtime)} {hhmm(file.mtime)} · {formatSize(file.size)}
                  </span>
                }
              />
            ))}
          </FileGroup>
        ))
      )}
    </section>
  )
}

export { BinFiles }
