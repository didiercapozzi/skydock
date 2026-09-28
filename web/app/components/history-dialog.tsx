import { plural, t } from '@lingui/core/macro'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { routingEngine } from '../helpers/routing'
import { Mini } from './buttons'
import { Modal, Spacer } from './modal'
import { dateLabel, hhmm } from './utils'

const historySchema = z.object({
  steps: z.array(
    z.object({ step: z.string(), at: z.number(), jumps: z.number(), files: z.number() })
  )
})

/* The board as it was after each of its last changes, the latest first, and a way to go back to one
   (RULES, Going back). Going back is itself a change, so it can be undone from here too. Nothing on
   the disk moves: only what the board says about the files. */
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
      title={t`Go back to an earlier board`}
      onClose={onClose}
      footer={
        <>
          <Spacer />
          <Mini onClick={onClose}>{t`Close`}</Mini>
        </>
      }>
      <p className='m-0 text-[12.5px] text-ink-2'>
        {t`Each change to the board — filing, naming, trimming — keeps what the board was before it. Going back puts the jumps, names and trims back; no file on the disk or on the storage is touched.`}
      </p>
      {problem && <p className='m-0 text-[12.5px] text-local'>{problem}</p>}
      {steps === null && !problem ? (
        <p className='m-0 text-[12.5px] text-ink-3'>{t`Reading the history…`}</p>
      ) : steps && steps.length === 0 ? (
        <p className='m-0 text-[12.5px] text-ink-3'>{t`Nothing to go back to yet.`}</p>
      ) : (
        <ul className='m-0 flex list-none flex-col gap-px rounded-lg border border-line p-[5px]'>
          {(steps ?? []).map((step) => (
            <li
              key={step.step}
              className='flex items-center gap-3 rounded-md px-2 py-1.5 text-[12.5px] hover:bg-line-2'>
              <span className='font-mono text-[12px] text-ink tabular-nums'>
                {dateLabel(step.at)} {hhmm(step.at)}
              </span>
              <span className='flex-1 text-ink-2'>
                {plural(step.jumps, { one: '# jump', other: '# jumps' })} ·{' '}
                {plural(step.files, { one: '# file', other: '# files' })}
              </span>
              <Mini onClick={() => onGoBack(step.step)}>{t`Go back to this`}</Mini>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

export { HistoryDialog }
