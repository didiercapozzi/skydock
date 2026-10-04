import { plural, t } from '@lingui/core/macro'
import { useState } from 'react'
import { dsmFolderUrl } from '../helpers/dsm'
import { routingEngine } from '../helpers/routing'
import { liveJobs, useJobs } from '../hooks/liveStore'
import type { Job } from '../hooks/useLiveProgress'
import { Mini } from './buttons'
import type { IconName } from './icons'
import { ProgressPanel } from './progress-panel'
import type { ProgressRow } from './progress-panel'
import { formatSize } from './utils'

/* Every task under way beside the board, in the one panel (RULES, Principles): freeing, scanning, putting
   files back, deleting off a camera, fetching from the storage. Whatever it is, it is read the same way —
   a title naming what it is about, one bar across the whole, the thing being done now with a bar of its
   own, and the reason when it is refused, which stays until it is put away.

   What differs from one task to the next is only its words, kept here in one place: what each is called,
   what it is doing at each stage, and what is said of a file at each point of its way. */
type Looks = {
  icon: IconName
  title: string
  /* what the panel is called when it is read out, when that is not its title */
  aria?: string
  /* what is done to the one under way */
  doing: string
  /* how it is going, in words, under the bar */
  summary: string
  /* the whole bar, read out */
  bar: string
  /* said beside a file, for where it has got to */
  note?: (row: Job['rows'][number]) => string | undefined
  /* what else is said of a file: what is done to it, or where it leads */
  extra?: (row: Job['rows'][number], dsmHost?: string | null) => Partial<ProgressRow>
  /* what has been done goes first and in green, so what is left is read from below it */
  doneFirst?: boolean
}

const looksOf = ({ type, label, stage, done, total, rows, phase }: Job): Looks => {
  const checking = stage === 'checking'
  switch (type) {
    case 'free':
    case 'free-place':
      return {
        icon: 'back',
        title: t`Freeing ${label}`,
        doing: checking ? t`Checking the storage` : t`Deleting`,
        summary: checking
          ? t`Proving the storage holds every file that went up — nothing is deleted before that`
          : type === 'free'
            ? t`Deleting what is here, and the whole of its folder`
            : t`Deleting what is here, file by file`,
        bar: t`Freed of ${label}`
      }
    case 'scan':
      return {
        icon: 'scan',
        title: t`Scanning ${label}`,
        doing: t`Reading`,
        summary: t`Reading each file, so it is known by what it contains`,
        bar: t`Scanned of ${label}`
      }
    case 'copy-back':
      return {
        icon: 'copying',
        title: t`Copying files back`,
        doing: t`Copying`,
        summary: t`Copying the files back off the card`,
        bar: t`Copied back`
      }
    case 'bin':
      return {
        icon: 'bin',
        title: t`Bringing files back from the bin`,
        doing: t`Moving`,
        summary: t`Moving the files back`,
        bar: t`Brought back from the bin`
      }
    case 'trash':
      return {
        icon: 'bin',
        title: t`Putting files in the bin`,
        doing: t`Moving`,
        summary: t`Moving the files into the bin`,
        bar: t`Put in the bin`
      }
    case 'template':
      return {
        icon: 'montage',
        title: t`Adding the template ${label}`,
        doing: t`Copying`,
        summary: t`Copying the template’s files`,
        bar: t`Template added`
      }
    case 'bring':
      return {
        icon: 'back',
        title: t`Bringing back from the storage`,
        doing: t`Fetching`,
        summary: t`${done} of ${total} brought back`,
        bar: t`Brought back`,
        note: (row) => (row.at === 'failed' ? t`not brought back` : undefined)
      }
    case 'camera-delete':
      return {
        icon: 'camera',
        title: t`Deleting from the camera`,
        doing: t`Checking`,
        summary: t`${done} of ${plural(total, { one: '# file', other: '# files' })} deleted`,
        bar: t`Deleted from the camera`,
        doneFirst: true,
        note: (row) =>
          row.at === 'done'
            ? t`moved to the bin`
            : row.at === 'failed'
              ? t`not deleted`
              : row.phase === 'moving'
                ? t`moving to the bin`
                : row.phase === 'checked'
                  ? t`checked — waiting to move`
                  : undefined
      }
    case 'camera-copy': {
      const copied = rows.filter((row) => row.at === 'done').length
      const skipped = rows.filter((row) => row.at === 'skipped').length
      return {
        icon: 'copying',
        title: t`Copying the camera ${label}`,
        aria: t`Copying ${label}`,
        doing: t`Copying`,
        summary: `${plural(copied, { one: '# new file copied', other: '# new files copied' })}${
          skipped > 0
            ? ` · ${plural(skipped, { one: '# already here', other: '# already here' })}`
            : ''
        } · ${t`scanned when done`}`,
        bar: t`Copied off ${label}`,
        note: (row) =>
          row.at === 'skipped'
            ? t`already here`
            : row.at === 'failed'
              ? t`could not be read`
              : undefined
      }
    }
    case 'upload': {
      const bytes = formatSize(rows.reduce((sum, row) => sum + row.size, 0))
      const finished = rows.filter((row) => row.at !== 'now' && row.at !== 'later').length
      const count = rows.length
      return {
        icon: 'upload',
        title: t`Uploading ${label}`,
        doing: t`Sending`,
        summary:
          phase === 'archiving'
            ? t`Making the zips…`
            : phase === 'checking' && rows.length === 0
              ? total > 0
                ? t`Looking at what the storage holds — ${done} of ${total}`
                : t`Looking at what the storage holds…`
              : t`${finished} of ${plural(count, { one: '# item', other: '# items' })} on the storage — ${bytes} in all`,
        bar: t`Uploaded of ${label}`,
        extra: (row, dsmHost) => {
          const where = row.to ? `${row.to}/${row.name}` : row.name
          const href =
            dsmHost &&
            row.to &&
            (row.at === 'done' || row.at === 'skipped' || row.phase === 'taken')
              ? (dsmFolderUrl(dsmHost, where) ?? undefined)
              : undefined
          return {
            title: where,
            ...(href ? { href } : {}),
            ...(row.phase === 'zipping'
              ? {
                  doing: t`Zipping`,
                  note: `${t`zipping`} · ${Math.round((row.part ?? 0) * 100)}%`
                }
              : row.phase === 'zipped'
                ? { note: t`zipped` }
                : row.phase === 'sending'
                  ? { doing: t`Sending` }
                  : row.phase === 'there'
                    ? { note: t`already uploaded — not sent again` }
                    : row.phase === 'taken'
                      ? { note: t`already on the storage` }
                      : row.phase === 'failed'
                        ? { note: t`not sent` }
                        : {})
          }
        }
      }
    }
    case 'proxy':
      return {
        icon: 'play',
        title: t`Making small copies`,
        doing: t`Making`,
        summary: t`${done} of ${plural(total, { one: '# clip', other: '# clips' })} made — they play and scrub at once with one`,
        bar: t`Small copies made`
      }
    case 'moments':
      return {
        icon: 'scan',
        title: t`Finding the jumps`,
        doing: t`Reading`,
        summary: t`${done} of ${plural(total, { one: '# clip', other: '# clips' })} read for where the jump is`,
        bar: t`Jumps found`
      }
    case 'process':
      return {
        icon: 'copying',
        title: t`Preparing the files`,
        doing: t`Copying`,
        summary: t`${done} of ${plural(total, { one: '# file', other: '# files' })} prepared`,
        bar: t`Files prepared`
      }
    case 'import':
      return {
        icon: 'copying',
        title: t`Adding ${label}`,
        doing: t`Copying`,
        summary: t`${done} of ${total} copied into the originals`,
        bar: t`Copied into ${label}`,
        note: (row) => (row.phase === 'reading' ? t`reading it…` : undefined)
      }
  }
}

/* what the job says of each file, as the panel draws it; a job with no file to list says the one thing it
   is doing now, so there is always a line to read */
const rowsOf = (job: Job, looks: Looks, dsmHost?: string | null): ProgressRow[] => {
  const failed = job.stage === 'failed'
  const made: ProgressRow[] =
    job.rows.length > 0
      ? job.rows.map((row) => ({
          key: row.key,
          name: row.name,
          size: row.size,
          at: row.at,
          part: row.at === 'now' ? row.part : undefined,
          note: looks.note?.(row),
          ...looks.extra?.(row, dsmHost),
          tint: looks.doneFirst ? row.at === 'done' : undefined
        }))
      : job.name
        ? [{ key: job.name, name: job.name, size: 0, at: failed ? 'failed' : 'now' }]
        : []
  return looks.doneFirst
    ? [...made.filter((r) => r.at === 'done'), ...made.filter((r) => r.at !== 'done')]
    : made
}

/* how far through the whole of it, between 0 and 1 — a file under way counted for as much of itself as
   is done, so one long file on its own is a bar that moves */
const partOf = (job: Job) =>
  job.rows.length > 0
    ? job.rows.reduce(
        (n, row) => n + (row.at === 'now' ? (row.part ?? 0) : row.at === 'later' ? 0 : 1),
        0
      ) / job.rows.length
    : job.total > 0
      ? job.done / job.total
      : 0

/* what can be done to a task while it goes: stop it — kept in view even folded */
type Stop = { run: () => void; word: string; busy: string; title: string }

const StopButton = ({ stop }: { stop: Stop }) => {
  const [stopping, setStopping] = useState(false)
  return (
    <Mini
      disabled={stopping}
      title={stop.title}
      onClick={() => {
        setStopping(true)
        stop.run()
      }}>
      {stopping ? stop.busy : stop.word}
    </Mini>
  )
}

/* the one thing each kind of task lets be done to it */
const stopOf = (type: Job['type']): Stop | null =>
  type === 'camera-copy'
    ? {
        run: () =>
          void routingEngine
            .action({ url: '/api/camera', actionArgs: { stop: true } })
            .catch(() => null),
        word: t`Stop`,
        busy: t`Stopping…`,
        title: t`Stop after the file under way — what came across stays, the rest stays on the card`
      }
    : type === 'upload'
      ? {
          run: () =>
            void routingEngine
              .action({ url: '/api/manifest', actionArgs: { intent: 'cancel-upload' } })
              .catch(() => null),
          word: t`Cancel`,
          busy: t`Cancelling…`,
          title: t`Stop it now — nothing of it is recorded, and what already went up is found there next time`
        }
      : null

const JobPanel = ({ job, dsmHost }: { job: Job; dsmHost?: string | null }) => {
  const looks = looksOf(job)
  const rows = rowsOf(job, looks, dsmHost)
  const failed = job.stage === 'failed'
  const stop = stopOf(job.type)
  const finished = rows.filter((r) => r.at === 'done').length
  return (
    <ProgressPanel
      label={looks.aria ?? looks.title}
      icon={looks.icon}
      title={looks.title}
      barLabel={looks.bar}
      barTitle={t`${job.done} of ${job.total} steps`}
      doing={looks.doing}
      rows={rows}
      overall={partOf(job)}
      counted={{
        at: rows.length > 0 ? finished : job.done,
        of: rows.length > 0 ? rows.length : job.total
      }}
      summary={failed ? <span className='text-local'>{job.reason}</span> : looks.summary}
      action={
        failed ? (
          <Mini onClick={() => liveJobs.update(({ [job.id]: _put, ...rest }) => rest)}>
            {t`Dismiss`}
          </Mini>
        ) : stop ? (
          <StopButton stop={stop} />
        ) : undefined
      }
    />
  )
}

const JobsPanel = ({ dsmHost }: { dsmHost?: string | null }) => (
  <>
    {useJobs().map((job) => (
      <JobPanel
        key={job.id}
        job={job}
        dsmHost={dsmHost}
      />
    ))}
  </>
)

/* how far through the bytes of what is going up, between 0 and 1 — a file of a gigabyte counts for a
   thousand of a megabyte, which is what a person watching an upload means by "halfway" */
const bytesPartOf = (job: Job) => {
  const total = job.rows.reduce((sum, row) => sum + row.size, 0)
  return total > 0
    ? job.rows.reduce(
        (sum, row) =>
          sum + row.size * (row.at === 'now' ? (row.part ?? 0) : row.at === 'later' ? 0 : 1),
        0
      ) / total
    : partOf(job)
}

/* the one line the status bar says of what is going, with how far through it is */
const headlineOf = (job: Job) => ({
  icon: looksOf(job).icon,
  what:
    job.type === 'camera-copy'
      ? t`${job.label} · copying ${job.done} of ${job.total}`
      : looksOf(job).title,
  part:
    job.type === 'upload'
      ? bytesPartOf(job)
      : job.total > 0 && job.type === 'camera-copy'
        ? job.done / job.total
        : partOf(job)
})

export { bytesPartOf, headlineOf, JobsPanel, looksOf, partOf }
