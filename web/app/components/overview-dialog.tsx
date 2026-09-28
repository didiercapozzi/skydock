import { plural, t } from '@lingui/core/macro'
import type { MontageProgress, MontageStep } from '@skydock/scripts'
import { useState } from 'react'
import { Mini } from './buttons'
import { INPUT, Modal, Spacer } from './modal'
import { StepButton, StepMeter } from './montage-steps'

/* One montage as the overview lists it: who, which day, how far it has got, and what the storage's
   list says of it. `id` is the jump that stands for it, for whatever is done to it from here. */
type OverviewRow = {
  who: string
  id: string
  day: string
  progress: MontageProgress
  link?: string
  emailed: boolean
  freed: boolean
  paid: boolean
}

const Mark = ({ on, label }: { on: boolean; label: string }) => (
  <span
    aria-label={`${label}: ${on ? t`yes` : t`no`}`}
    className={on ? 'text-up' : 'text-ink-3'}>
    {on ? '✓' : '—'}
  </span>
)

/* Every montage on the board in one table — who, the day, the step it is at, whether it went up,
   its link, whether they were emailed, whether it was freed — with what is done to many at once
   above it: every named montage not yet processed, processed in one go; every film rendered and not
   yet sent, sent one after the other. What is left to do for one is a press on its line
   (RULES, The overview). */
const OverviewDialog = ({
  rows,
  busy,
  onGo,
  onStep,
  onProcessAll,
  onUploadAll,
  onPaid,
  onClose
}: {
  rows: OverviewRow[]
  busy: boolean
  onGo: (who: string) => void
  onStep: (id: string, step: MontageStep) => void
  onProcessAll: (ids: string[]) => void
  onUploadAll: (ids: string[]) => void
  onPaid: (id: string, paid: boolean) => void
  onClose: () => void
}) => {
  const [find, setFind] = useState('')
  const shown = rows.filter((r) => r.who.toLowerCase().includes(find.trim().toLowerCase()))
  const atStep = (step: MontageStep) =>
    rows.filter((r) => !r.freed && r.progress.steps[r.progress.at]?.name === step).map((r) => r.id)
  const toProcess = atStep('Processed')
  const toUpload = atStep('Uploaded')
  const toEmail = atStep('Emailed').length
  /* the day's work in four numbers */
  const count = (done: (r: OverviewRow) => boolean) => rows.filter(done).length
  const uploadedCount = count(
    (r) => r.progress.steps.find((s) => s.name === 'Uploaded')?.done ?? false
  )
  const emailedCount = count((r) => r.emailed)
  const paidCount = count((r) => r.paid)
  const total = rows.length
  return (
    <Modal
      label={t`Overview`}
      title={t`Every montage`}
      full
      onClose={onClose}
      footer={
        <>
          <span className='text-[12px] text-ink-2'>
            {plural(total, { one: '# montage', other: '# montages' })}
            {t` · ${uploadedCount} uploaded · ${emailedCount} emailed · ${paidCount} paid`}
            {' · '}
            {toEmail > 0
              ? plural(toEmail, {
                  one: '# montage still to email',
                  other: '# montages still to email'
                })
              : t`Nobody is waiting for an email`}
          </span>
          <Spacer />
          <Mini onClick={onClose}>{t`Close`}</Mini>
        </>
      }>
      <div className='flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5'>
        <input
          type='search'
          aria-label={t`Find a montage`}
          placeholder={t`Find a montage`}
          value={find}
          onChange={(e) => setFind(e.target.value)}
          className={`${INPUT} w-56`}
        />
        <Spacer />
        <Mini
          disabled={busy || toProcess.length === 0}
          onClick={() => onProcessAll(toProcess)}>
          {plural(toProcess.length, {
            one: 'Process the # named montage',
            other: 'Process the # named montages'
          })}
        </Mini>
        <Mini
          disabled={busy || toUpload.length === 0}
          title={t`Sent one after the other, each as the upload dialog was last set`}
          onClick={() => onUploadAll(toUpload)}>
          {plural(toUpload.length, {
            one: 'Upload the # rendered film',
            other: 'Upload the # rendered films'
          })}
        </Mini>
      </div>
      <div className='min-h-0 flex-1 overflow-auto px-4 pb-4'>
        {rows.length === 0 ? (
          <p className='mt-6 text-center text-[12.5px] text-ink-3'>
            {t`No montage yet — name a jump to make one.`}
          </p>
        ) : (
          <table className='mt-2 w-full border-collapse text-[12.5px]'>
            <thead>
              <tr className='text-left text-[11px] tracking-[0.06em] text-ink-3 uppercase'>
                <th className='py-1.5 pr-3 font-semibold'>{t`Montage`}</th>
                <th className='py-1.5 pr-3 font-semibold'>{t`Day`}</th>
                <th className='py-1.5 pr-3 font-semibold'>{t`Where it has got to`}</th>
                <th className='py-1.5 pr-3 text-center font-semibold'>{t`Uploaded`}</th>
                <th className='py-1.5 pr-3 font-semibold'>{t`Link`}</th>
                <th className='py-1.5 pr-3 text-center font-semibold'>{t`Emailed`}</th>
                <th className='py-1.5 pr-3 text-center font-semibold'>{t`Freed`}</th>
                <th className='py-1.5 pr-3 text-center font-semibold'>{t`Paid`}</th>
                <th className='py-1.5' />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const step = r.progress.steps[r.progress.at]?.name
                return (
                  <tr
                    key={r.id}
                    className='border-t border-line-2'>
                    <td className='py-1.5 pr-3'>
                      <button
                        type='button'
                        onClick={() => onGo(r.who)}
                        className='font-semibold text-ink underline-offset-2 hover:underline'>
                        {r.who}
                      </button>
                    </td>
                    <td className='py-1.5 pr-3 font-mono text-[12px] text-ink-2'>{r.day}</td>
                    <td className='py-1.5 pr-3'>
                      <span className='flex min-w-[140px] flex-col gap-1'>
                        <StepMeter progress={r.progress} />
                        <span className='text-[11px] text-ink-2'>
                          {r.progress.next?.todo ?? t`done`}
                        </span>
                      </span>
                    </td>
                    <td className='py-1.5 pr-3 text-center'>
                      <Mark
                        on={r.progress.steps.find((s) => s.name === 'Uploaded')?.done ?? false}
                        label={t`Uploaded`}
                      />
                    </td>
                    <td className='max-w-[220px] truncate py-1.5 pr-3'>
                      {r.link ? (
                        <a
                          href={r.link}
                          target='_blank'
                          rel='noreferrer'
                          className='font-mono text-[11.5px] text-accent underline'>
                          {r.link}
                        </a>
                      ) : (
                        <span className='text-ink-3'>—</span>
                      )}
                    </td>
                    <td className='py-1.5 pr-3 text-center'>
                      <Mark
                        on={r.emailed}
                        label={t`Emailed`}
                      />
                    </td>
                    <td className='py-1.5 pr-3 text-center'>
                      <Mark
                        on={r.freed}
                        label={t`Freed`}
                      />
                    </td>
                    <td className='py-1.5 pr-3 text-center'>
                      <input
                        type='checkbox'
                        aria-label={t`${r.who} has paid`}
                        checked={r.paid}
                        disabled={busy}
                        onChange={(e) => onPaid(r.id, e.target.checked)}
                      />
                    </td>
                    <td className='py-1.5 text-right'>
                      {step && !r.freed && (
                        <StepButton
                          step={step}
                          busy={busy}
                          onStep={(next) => onStep(r.id, next)}
                        />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  )
}

export { OverviewDialog }
export type { OverviewRow }
