import { plural, t } from '@lingui/core/macro'
import { useEffect, useState } from 'react'
import { boardChangeSchema } from '@skydock/scripts'
import type { BoardChange } from '@skydock/scripts'
import { z } from 'zod'
import { routingEngine } from '../helpers/routing'
import { Mini } from './buttons'
import { Modal, Spacer } from './modal'
import { dateLabel, hhmm } from './utils'

const historySchema = z.object({
  steps: z.array(z.object({ step: z.string(), at: z.number(), change: boardChangeSchema }))
})

/* where files went, as the board names the place */
const placeSaid = (to: BoardChange['filed'][number]['to']) =>
  to.kind === 'fresh' ? t`Fresh files` : to.kind === 'dz' ? to.name : t`${to.name}’s montage`

/* What a change did, in a few words, the most telling first: a montage made or gone, files filed,
   trims, times, and what processing and uploading did. Everything it did is said, a line each. */
const saidOf = (change: BoardChange) => {
  const lines: string[] = []
  for (const who of change.montagesMade) lines.push(t`Made ${who}’s montage`)
  for (const who of change.montagesGone) lines.push(t`Took ${who}’s montage apart`)
  for (const { to, files } of change.filed) {
    const where = placeSaid(to)
    lines.push(
      plural(files, { one: `Moved # file to ${where}`, other: `Moved # files to ${where}` })
    )
  }
  const { jumpsMade, jumpsGone, jumpsRenamed, trimmed, retimed, filesAdded, filesGone } = change
  if (jumpsMade > 0) lines.push(plural(jumpsMade, { one: 'Made # jump', other: 'Made # jumps' }))
  if (jumpsGone > 0)
    lines.push(plural(jumpsGone, { one: 'Removed # jump', other: 'Removed # jumps' }))
  if (jumpsRenamed > 0)
    lines.push(plural(jumpsRenamed, { one: 'Renamed # jump', other: 'Renamed # jumps' }))
  if (trimmed > 0)
    lines.push(
      plural(trimmed, {
        one: 'Trimmed, framed or turned # file',
        other: 'Trimmed, framed or turned # files'
      })
    )
  if (retimed > 0)
    lines.push(
      plural(retimed, { one: 'Changed the time of # file', other: 'Changed the time of # files' })
    )
  if (filesAdded > 0) lines.push(plural(filesAdded, { one: '# new file', other: '# new files' }))
  if (filesGone > 0)
    lines.push(plural(filesGone, { one: '# file left the board', other: '# files left the board' }))
  if (change.processed > 0)
    lines.push(plural(change.processed, { one: 'Processed # file', other: 'Processed # files' }))
  if (change.uploaded > 0)
    lines.push(plural(change.uploaded, { one: 'Uploaded # file', other: 'Uploaded # files' }))
  for (const who of change.paid) lines.push(t`${who} marked paid`)
  for (const who of change.unpaid) lines.push(t`${who} no longer marked paid`)
  return lines
}

/* today's changes by the time alone; older ones with their day */
const whenSaid = (at: number) =>
  dateLabel(at) === dateLabel(Math.floor(Date.now() / 1000))
    ? hhmm(at)
    : `${dateLabel(at)} ${hhmm(at)}`

/* The last changes made on the board, the latest first, each said in words — what it did, not what
   the board held — with a way to go back to how the board was before it, which undoes it and every
   change after it (RULES, Going back). Going back is itself a change, so it can be undone from here
   too. Nothing on the disk moves: only what the board says about the files. */
const HistoryDialog = ({
  onGoBack,
  onClose
}: {
  onGoBack: (step: string) => void
  onClose: () => void
}) => {
  const [steps, setSteps] = useState<z.infer<typeof historySchema>['steps'] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    routingEngine
      .loader({ url: '/api/history' })
      .then((raw) => {
        if (cancelled) return
        const parsed = historySchema.safeParse(raw)
        if (parsed.success) setSteps(parsed.data.steps)
        else setProblem(t`The board’s history could not be read.`)
      })
      .catch(() => {
        if (!cancelled) setProblem(t`The board’s history could not be read.`)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return (
    <Modal
      label={t`History`}
      title={t`What changed on the board`}
      onClose={onClose}
      footer={
        <>
          <Spacer />
          <Mini onClick={onClose}>{t`Close`}</Mini>
        </>
      }>
      <p className='m-0 text-[12.5px] text-ink-2'>
        {t`The last changes made on the board, the latest first. Going back to before one undoes it and every change after it — the jumps, names and trims; no file on the disk or on the storage is touched.`}
      </p>
      {problem && <p className='m-0 text-[12.5px] text-local'>{problem}</p>}
      {steps === null && !problem ? (
        <p className='m-0 text-[12.5px] text-ink-3'>{t`Reading the history…`}</p>
      ) : steps && steps.length === 0 ? (
        <p className='m-0 text-[12.5px] text-ink-3'>{t`Nothing to go back to yet.`}</p>
      ) : (
        <ul className='m-0 flex list-none flex-col overflow-hidden rounded-md border border-line'>
          {(steps ?? []).map((step) => (
            <li
              key={step.step}
              className='flex items-center gap-3 border-b border-line-2 px-2.5 py-2 text-[12.5px] last:border-b-0 hover:bg-rail'>
              <span className='w-[7.5rem] flex-none font-mono text-[12px] text-ink-3 tabular-nums'>
                {whenSaid(step.at)}
              </span>
              <span className='flex min-w-0 flex-1 flex-col text-ink'>
                {saidOf(step.change).map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </span>
              <Mini
                title={t`Puts the board back as it was just before this change`}
                onClick={() => onGoBack(step.step)}>
                {t`Undo from here`}
              </Mini>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

export { HistoryDialog }
