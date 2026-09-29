import { plural, t } from '@lingui/core/macro'
import { isoDay } from '@skydock/scripts'
import type { MontageProgress, MontageStep } from '@skydock/scripts'
import { useState } from 'react'
import { dayLabel } from '../helpers/jumps'
import { Mini } from './buttons'
import { Icon } from './icons'
import { Modal, Spacer } from './modal'
import { StepButton, StepMeter } from './montage-steps'
import { shortDate, weekday } from './utils'

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

/* ticked in green where it is done, a quiet dash where it is not */
const Mark = ({ on, label }: { on: boolean; label: string }) => (
  <span
    aria-label={`${label}: ${on ? t`yes` : t`no`}`}
    className={`inline-grid place-items-center ${on ? 'text-up' : 'text-ink-3'}`}>
    {on ? (
      <Icon
        name='check'
        size={15}
        weight={2.2}
      />
    ) : (
      '—'
    )}
  </span>
)

/* a table's column heading and its cells, as every table in a dialog draws them */
const TH =
  'border-b border-line bg-rail px-2.5 py-2 text-[11.5px] font-medium whitespace-nowrap text-ink-3'
const TD = 'h-[46px] border-b border-line-2 px-2.5 whitespace-nowrap'

/* the day a montage heads, whole for the heading of its run and short on its own line */
const dayShort = (day: string) => {
  const [year, month, date] = isoDay(day).split('-').map(Number)
  if (!year || !month || !date) return day
  const at = new Date(year, month - 1, date)
  return `${weekday(at, 'short')} ${shortDate(at.getTime() / 1000)}`
}

const uploaded = (r: OverviewRow) =>
  r.progress.steps.find((s) => s.name === 'Uploaded')?.done ?? false

/* what a run of montages comes to, in the words of the table's columns; what none of them has done
   yet is left unsaid */
const counts = (rows: OverviewRow[]) => {
  const total = rows.length
  const up = rows.filter(uploaded).length
  const emailed = rows.filter((r) => r.emailed).length
  const paid = rows.filter((r) => r.paid).length
  return [
    plural(total, { one: '# montage', other: '# montages' }),
    up > 0 && t`${up} uploaded`,
    emailed > 0 && t`${emailed} emailed`,
    paid > 0 && t`${paid} paid`
  ]
    .filter(Boolean)
    .join(' · ')
}

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
  /* the montages found, a run to each day, in the order the board gives them */
  const days = [...new Set(shown.map((r) => r.day))].map((day) => ({
    day,
    rows: shown.filter((r) => r.day === day)
  }))
  return (
    <Modal
      label={t`Overview`}
      title={t`Overview`}
      sub={
        <>
          {counts(rows)}
          {' · '}
          {toEmail > 0
            ? plural(toEmail, {
                one: '# montage still to email',
                other: '# montages still to email'
              })
            : t`Nobody is waiting for an email`}
        </>
      }
      aside={
        <label className='flex h-7 w-[260px] items-center gap-[7px] rounded-[5px] px-2 text-ink-3 focus-within:bg-pane'>
          <Icon
            name='search'
            size={15}
          />
          <input
            type='search'
            aria-label={t`Find a montage`}
            placeholder={t`Find a montage`}
            value={find}
            onChange={(e) => setFind(e.target.value)}
            className='min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-3'
          />
        </label>
      }
      full
      onClose={onClose}
      footer={
        <>
          <span className='text-[11.5px] text-ink-3'>{t`A press on a line takes its next step.`}</span>
          <Spacer />
          <Mini onClick={onClose}>{t`Close`}</Mini>
        </>
      }>
      <div className='flex flex-none flex-wrap items-center gap-2.5 border-b border-line-2 bg-rail px-6 py-3'>
        <span className='mr-1.5 text-[11.5px] font-medium text-ink-3'>{t`To many at once`}</span>
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
          onClick={() => onUploadAll(toUpload)}>
          <Icon
            name='upload'
            size={14}
          />
          {plural(toUpload.length, {
            one: 'Upload the # rendered film',
            other: 'Upload the # rendered films'
          })}
        </Mini>
        <span className='ml-2 max-w-[520px] text-[11.5px] leading-normal text-ink-3'>
          {t`Uploaded one after the other, each as the upload dialog was last set. One that cannot go says why; the rest still go.`}
        </span>
      </div>
      <div className='min-h-0 flex-1 overflow-auto px-6 pt-1 pb-4'>
        {rows.length === 0 ? (
          <p className='mt-6 text-center text-[12.5px] text-ink-3'>
            {t`No montage yet — name a jump to make one.`}
          </p>
        ) : (
          <table className='w-full border-collapse text-[12.5px]'>
            <thead>
              <tr className='text-left'>
                <th className={TH}>{t`Montage`}</th>
                <th className={TH}>{t`Day`}</th>
                <th className={TH}>{t`Where it has got to`}</th>
                <th className={`${TH} text-center`}>{t`Uploaded`}</th>
                <th className={TH}>{t`Link`}</th>
                <th className={`${TH} text-center`}>{t`Emailed`}</th>
                <th className={`${TH} text-center`}>{t`Freed`}</th>
                <th className={`${TH} text-center`}>{t`Paid`}</th>
                <th className={`${TH} text-right`}>{t`Next`}</th>
              </tr>
            </thead>
            {days.map(({ day, rows: ofDay }) => (
              <tbody key={day}>
                <tr>
                  <td
                    colSpan={9}
                    className='h-11 border-b border-line px-2.5 pt-2.5 align-bottom whitespace-nowrap'>
                    <span className='text-[14px] font-semibold tracking-[-0.02em]'>
                      {dayLabel(isoDay(day), true)}
                    </span>
                    <span className='ml-3 text-[11.5px] text-ink-3'>{counts(ofDay)}</span>
                  </td>
                </tr>
                {ofDay.map((r) => {
                  const step = r.progress.steps[r.progress.at]?.name
                  return (
                    <tr key={r.id}>
                      <td className={TD}>
                        <button
                          type='button'
                          onClick={() => onGo(r.who)}
                          className='font-semibold text-ink underline-offset-2 hover:underline'>
                          {r.who}
                        </button>
                      </td>
                      <td className={`${TD} font-mono text-[12px] text-ink-3`}>
                        {dayShort(r.day)}
                      </td>
                      <td className={TD}>
                        <span className='flex items-center gap-2.5'>
                          <StepMeter
                            progress={r.progress}
                            className='w-[70px] flex-none'
                          />
                          <span
                            className={`text-[11.5px] ${r.progress.next ? 'text-accent-ink' : 'text-ink-3'}`}>
                            {r.progress.next?.todo ?? t`done`}
                          </span>
                        </span>
                      </td>
                      <td className={`${TD} text-center`}>
                        <Mark
                          on={uploaded(r)}
                          label={t`Uploaded`}
                        />
                      </td>
                      <td className={`${TD} max-w-[220px] truncate`}>
                        {r.link ? (
                          <a
                            href={r.link}
                            target='_blank'
                            rel='noreferrer'
                            className='font-mono text-[12px] text-ink-2 hover:text-accent-ink hover:underline'>
                            {r.link}
                          </a>
                        ) : (
                          <span className='text-ink-3'>—</span>
                        )}
                      </td>
                      <td className={`${TD} text-center`}>
                        <Mark
                          on={r.emailed}
                          label={t`Emailed`}
                        />
                      </td>
                      <td className={`${TD} text-center`}>
                        <Mark
                          on={r.freed}
                          label={t`Freed`}
                        />
                      </td>
                      <td className={`${TD} text-center`}>
                        <span className='relative inline-grid place-items-center align-middle'>
                          <input
                            type='checkbox'
                            aria-label={t`${r.who} has paid`}
                            checked={r.paid}
                            disabled={busy}
                            onChange={(e) => onPaid(r.id, e.target.checked)}
                            className='peer size-[15px] cursor-pointer appearance-none rounded border-[1.5px] border-[#c4c4cc] bg-pane checked:border-accent checked:bg-accent disabled:cursor-default'
                          />
                          <span className='pointer-events-none absolute hidden text-white peer-checked:block'>
                            <Icon
                              name='check'
                              size={11}
                              weight={3}
                            />
                          </span>
                        </span>
                      </td>
                      <td className={`${TD} text-right`}>
                        {step && !r.freed ? (
                          <StepButton
                            step={step}
                            busy={busy}
                            onStep={(next) => onStep(r.id, next)}
                          />
                        ) : (
                          !r.progress.next && (
                            <span className='text-[11.5px] text-ink-3'>{t`done`}</span>
                          )
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            ))}
          </table>
        )}
      </div>
    </Modal>
  )
}

export { OverviewDialog }
export type { OverviewRow }
