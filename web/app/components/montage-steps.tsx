import { i18n } from '@lingui/core'
import type { MessageDescriptor } from '@lingui/core'
import { msg, t } from '@lingui/core/macro'
import { montageSteps } from '@skydock/scripts'
import type { MontageFact, MontageProgress, MontageStep } from '@skydock/scripts'
import { useState } from 'react'
import { Go, Mini } from './buttons'
import { Icon } from './icons'
import type { ManifestGroup } from './types'

const STEP_ACTION: Partial<Record<MontageStep, MessageDescriptor>> = {
  Processed: msg`Process`,
  Edited: msg`Make the project`,
  Rendered: msg`Open in kdenlive`,
  Uploaded: msg`Upload…`,
  Emailed: msg`Email the link…`
}

const StepButton = ({
  step,
  busy,
  onStep
}: {
  step: MontageStep
  busy: boolean
  onStep: (step: MontageStep) => void
}) => {
  const action = STEP_ACTION[step]
  if (!action) return null
  const Button = step === 'Emailed' ? Go : Mini
  return (
    <Button
      disabled={busy}
      onClick={() => onStep(step)}>
      {i18n._(action)}
    </Button>
  )
}

const STEP_ABOUT: Record<MontageStep, MessageDescriptor> = {
  Named: msg`It needs a name first — a person, an event. The name becomes its folder, its file names and its film.`,
  Processed: msg`Makes the copies that get handed over: each clip and photo trimmed, framed and turned, in the montage’s own folder.`,
  Edited: msg`Lays the clips out in kdenlive. You edit there — the board notices the film by itself.`,
  Rendered: msg`Edit it in kdenlive and render the film there. The board notices the film by itself.`,
  Uploaded: msg`The film is rendered. Send it, the photos and the originals where you choose.`,
  Emailed: msg`The film is on the storage and the link works. The email is written already.`
}

const STEP_WORD: Record<MontageStep, MessageDescriptor> = {
  Named: msg`Named`,
  Processed: msg`Prepared`,
  Edited: msg`Project`,
  Rendered: msg`Film`,
  Uploaded: msg`Uploaded`,
  Emailed: msg`Sent`
}

const Tick = ({ size = 9 }: { size?: number }) => (
  <svg
    aria-hidden='true'
    viewBox='0 0 24 24'
    width={size}
    height={size}
    fill='none'
    stroke='currentColor'
    strokeWidth='3.5'
    strokeLinecap='round'
    strokeLinejoin='round'>
    <path d='M5 12.5 10 17 19 7' />
  </svg>
)

const StepTrail = ({
  group,
  facts,
  emailed,
  onStep,
  busy = false
}: {
  group: ManifestGroup
  facts?: MontageFact
  emailed: boolean
  onStep?: (step: MontageStep) => void
  busy?: boolean
}) => {
  const { steps, at, next } = montageSteps({ group, facts, emailed })
  const how = next?.how ?? ''
  return (
    <div className='flex flex-col gap-1.5'>
      <ol
        aria-label={t`Where this montage has got to`}
        className='m-0 flex list-none flex-col p-0'>
        {steps.map((step, i) => {
          const now = i === at
          const last = i === steps.length - 1
          return (
            <li
              key={step.name}
              aria-current={now ? 'step' : undefined}
              className={`relative grid grid-cols-[16px_minmax(0,1fr)] gap-x-2.5 ${last ? '' : 'pb-2.5'}`}>
              {!last && (
                <span
                  aria-hidden='true'
                  className={`absolute top-4.5 bottom-px left-1.875 w-px ${step.done ? 'bg-up' : 'bg-line'}`}
                />
              )}
              <span
                aria-hidden='true'
                className={`mt-px grid h-4 w-4 place-items-center rounded-full border-2 ${
                  step.done
                    ? 'border-up bg-up text-white'
                    : now
                      ? 'border-accent bg-pane shadow-halo'
                      : 'border-line-2 bg-pane'
                }`}>
                {step.done ? (
                  <Tick />
                ) : now ? (
                  <span className='h-1.5 w-1.5 rounded-full bg-accent' />
                ) : null}
              </span>
              <span className='flex min-w-0 flex-col'>
                <span
                  className={`text-body ${step.done || now ? 'font-semibold text-ink' : 'font-medium text-ink-3'}`}>
                  {i18n._(STEP_WORD[step.name])}
                  {step.done && <span className='sr-only'> {t`— done`}</span>}
                </span>
                {now && next && (
                  <span className='text-micro text-accent-ink'>{t`Next: ${how}`}</span>
                )}
                {now && onStep && (
                  <span className='mt-1'>
                    <StepButton
                      step={step.name}
                      busy={busy}
                      onStep={onStep}
                    />
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ol>
      {at === steps.length && (
        <p className='m-0 text-small font-semibold text-up'>
          {t`Every step done — whoever it is for has their film.`}
        </p>
      )}
    </div>
  )
}

const StepMeter = ({
  progress,
  className = 'flex-none'
}: {
  progress: MontageProgress
  className?: string
}) => {
  const { steps, at, next } = progress
  const total = steps.length
  const how = next?.how ?? ''
  const said = next
    ? t`Next: ${how} — ${at} of ${total} steps done`
    : t`Every step done — ${total} of ${total}`
  return (
    <span
      role='img'
      aria-label={said}
      title={said}
      className={`flex gap-0.75 ${className}`}>
      {steps.map((step, i) => (
        <i
          key={step.name}
          className={`block h-1 min-w-2.5 flex-1 rounded-bar ${
            step.done ? 'bg-up' : i === at ? 'bg-accent' : 'bg-line'
          }`}
        />
      ))}
    </span>
  )
}

const STEP_HINT: Record<MontageStep, { later: MessageDescriptor; done: MessageDescriptor }> = {
  Named: { later: msg`Give it a name`, done: msg`Named` },
  Processed: { later: msg`Prepare the files`, done: msg`Files ready` },
  Edited: { later: msg`Make the project`, done: msg`Project made` },
  Rendered: { later: msg`Render in kdenlive`, done: msg`Film rendered` },
  Uploaded: { later: msg`Upload to the storage`, done: msg`On the storage` },
  Emailed: { later: msg`Email the link`, done: msg`Link sent` }
}

const STEP_TITLE: Record<MontageStep, MessageDescriptor> = {
  Named: msg`Give it a name`,
  Processed: msg`Prepare the files`,
  Edited: msg`Make the editing project`,
  Rendered: msg`Render the film in kdenlive`,
  Uploaded: msg`Upload it to the storage`,
  Emailed: msg`Email the link`
}

const StepLine = ({
  progress,
  who,
  mini = false
}: {
  progress: MontageProgress
  who?: string
  mini?: boolean
}) => {
  const { steps, at } = progress
  if (mini)
    return (
      <ol
        aria-hidden='true'
        className='m-0 flex list-none flex-wrap items-center gap-x-1.5 gap-y-2 p-0'>
        {steps.map((step, i) => (
          <li
            key={step.name}
            aria-current={i === at ? 'step' : undefined}
            className='flex items-center gap-2'>
            <span
              className={`grid size-chip place-items-center rounded-full ${
                step.done ? 'bg-up text-white' : 'bg-pane shadow-inset-ring-accent'
              }`}>
              {step.done && <Tick size={11} />}
            </span>
            <b className={`text-body ${i === at ? 'text-accent-ink' : ''}`}>
              {i18n._(STEP_WORD[step.name])}
              {step.done && <span className='sr-only'> {t`— done`}</span>}
            </b>
            {i < steps.length - 1 && (
              <span
                className={`h-0.75 w-6.5 rounded-bar ${steps[i + 1]?.done ? 'bg-up' : 'bg-line'}`}
              />
            )}
          </li>
        ))}
      </ol>
    )
  const reach = steps.length > 1 ? Math.min(at, steps.length - 1) / (steps.length - 1) : 0
  return (
    <ol
      aria-hidden='true'
      className='relative m-0 grid list-none gap-0 p-0 py-1'
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      <span
        className='absolute top-4.25 right-[8.33%] left-[8.33%] h-0.5 rounded bg-line'
        aria-hidden='true'
      />
      <span
        className='absolute top-4.25 left-[8.33%] h-0.5 rounded bg-up'
        style={{ width: `${reach * 83.33}%` }}
        aria-hidden='true'
      />
      {steps.map((step, i) => {
        const now = i === at
        return (
          <li
            key={step.name}
            aria-current={now ? 'step' : undefined}
            className='relative flex min-w-0 flex-col items-center gap-1 text-center'>
            <span
              aria-hidden='true'
              className={`grid size-control place-items-center rounded-full border-2 bg-pane text-body font-bold ${
                step.done
                  ? 'border-up bg-up text-white'
                  : now
                    ? 'border-accent shadow-halo'
                    : 'border-line-2 text-ink-3'
              }`}>
              {step.done ? (
                <Tick size={15} />
              ) : now ? (
                <span className='size-3 rounded-full bg-accent' />
              ) : (
                i + 1
              )}
            </span>
            <b
              className={`text-lead ${now ? 'text-accent-ink' : step.done ? 'text-ink' : 'text-ink-3'}`}>
              {i18n._(STEP_WORD[step.name])}
              {step.done && <span className='sr-only'> {t`— done`}</span>}
            </b>
            <span className='max-w-full truncate text-small text-ink-3'>
              {step.done
                ? step.name === 'Named' && who
                  ? who
                  : i18n._(STEP_HINT[step.name].done)
                : now
                  ? t`Next up`
                  : i18n._(STEP_HINT[step.name].later)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

const NextStep = ({
  progress,
  who,
  linked = true,
  film,
  mini = false,
  children
}: {
  progress: MontageProgress
  who?: string
  linked?: boolean
  mini?: boolean
  film?: React.ReactNode
  children: React.ReactNode
}) => {
  const [explained, explain] = useState(false)
  const { steps, at } = progress
  const step = steps[at]
  const n = at + 1
  const total = steps.length
  return (
    <div className='flex w-full basis-full flex-col gap-4'>
      <StepLine
        progress={progress}
        who={who}
        mini={mini}
      />
      {film ?? (
        <div className='flex items-center gap-3.5 rounded-panel bg-accent-soft px-4 py-3'>
          <span className='grid size-control-lg flex-none place-items-center rounded-card bg-pane text-accent-ink'>
            <Icon
              name={step ? (step.name === 'Emailed' ? 'mail' : 'next') : 'check'}
              size={20}
            />
          </span>
          <div className='min-w-0 flex-1'>
            <div className='flex flex-wrap items-baseline gap-x-2'>
              <b className='font-display text-title font-semibold'>
                {step
                  ? step.name === 'Emailed' && who && linked
                    ? t`Send ${who} the link`
                    : i18n._(STEP_TITLE[step.name])
                  : t`Every step done`}
              </b>
              {step && (
                <span className='text-micro font-bold tracking-eyebrow text-accent-ink uppercase'>
                  {step.name === 'Emailed' ? t`Last step` : t`Step ${n} of ${total}`}
                </span>
              )}
            </div>
            <p className={`m-0 text-body text-ink-2 ${explained ? '' : 'truncate'}`}>
              {step
                ? step.name === 'Emailed' && !linked
                  ? t`The film is on the storage, but it has no link to send — make one from the panel.`
                  : i18n._(STEP_ABOUT[step.name])
                : t`Every step done — whoever it is for has their film.`}
            </p>
          </div>
          {step && (
            <button
              type='button'
              aria-label={t`What happens?`}
              aria-expanded={explained}
              title={t`What happens?`}
              onClick={() => explain(!explained)}
              className='grid size-control flex-none cursor-pointer place-items-center rounded-control border-0 bg-pane text-body font-bold text-accent-ink'>
              ?
            </button>
          )}
          <div className='flex-none'>{children}</div>
        </div>
      )}
    </div>
  )
}

export { NextStep, StepMeter, StepTrail }
