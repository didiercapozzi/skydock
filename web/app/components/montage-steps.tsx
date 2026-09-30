import { i18n } from '@lingui/core'
import type { MessageDescriptor } from '@lingui/core'
import { msg, t } from '@lingui/core/macro'
import { montageSteps } from '@skydock/scripts'
import type { MontageFact, MontageProgress, MontageStep } from '@skydock/scripts'
import { Mini } from './buttons'
import type { ManifestGroup } from './types'

/* the steps a press takes, in the words of each step's own button; naming is typed, so it has none */
const STEP_ACTION: Partial<Record<MontageStep, MessageDescriptor>> = {
  Processed: msg`Process`,
  Edited: msg`Make the project`,
  Rendered: msg`Open in kdenlive`,
  Uploaded: msg`Upload…`,
  Emailed: msg`Email the link…`
}

/* the button that takes a step, where one does */
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
  return (
    <Mini
      disabled={busy}
      onClick={() => onStep(step)}>
      {i18n._(action)}
    </Mini>
  )
}

/* what taking each step does, said where the step is offered as the next one */
const STEP_ABOUT: Record<MontageStep, MessageDescriptor> = {
  Named: msg`It needs a name first — a person, an event. The name becomes its folder, its file names and its film.`,
  Processed: msg`Makes the copies that get handed over: each clip and photo trimmed, framed and turned, in the montage’s own folder.`,
  Edited: msg`Writes the kdenlive project — clips laid out, render destination set — ready to be edited.`,
  Rendered: msg`Edit it in kdenlive and render the film there. The board notices the film by itself.`,
  Uploaded: msg`The film is rendered. Send it, the photos and the originals where you choose.`,
  Emailed: msg`Everything is on the storage. Send the link to whoever the film is for.`
}

/* a tick, for a step that is done */
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

/* Where a montage has got to, one step under the other the way it is walked: what is done ticked in
   green and joined up in green, the step it is at ringed in blue, with what to do next right under it
   in blue, and what is still to come greyed. The whole way is there at once, so nobody has to remember
   what comes after a render. Where no montage's own buttons are on screen — the Montages page with
   none open — the step it is at can be taken from here, so what says what is next also does it. */
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
  /* takes the step it is at; absent where the trail only reports, or the step is not one a press does */
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
                  className={`absolute top-[18px] bottom-px left-[7.5px] w-px ${step.done ? 'bg-up' : 'bg-line'}`}
                />
              )}
              <span
                aria-hidden='true'
                className={`mt-px grid h-4 w-4 place-items-center rounded-full border-2 ${
                  step.done
                    ? 'border-up bg-up text-white'
                    : now
                      ? 'border-accent bg-pane shadow-[0_0_0_3px_var(--color-accent-soft)]'
                      : 'border-line bg-pane'
                }`}>
                {step.done ? (
                  <Tick />
                ) : now ? (
                  <span className='h-1.5 w-1.5 rounded-full bg-accent' />
                ) : null}
              </span>
              <span className='flex min-w-0 flex-col'>
                <span
                  className={`text-[13px] ${step.done || now ? 'font-semibold text-ink' : 'font-medium text-ink-3'}`}>
                  {step.name}
                  {step.done && <span className='sr-only'> {t`— done`}</span>}
                </span>
                {now && next && (
                  <span className='text-[11.5px] text-accent-ink'>{t`Next: ${how}`}</span>
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
        <p className='m-0 text-[12px] font-semibold text-up'>
          {t`Every step done — whoever it is for has their film.`}
        </p>
      )}
    </div>
  )
}

/* The same way in one line, for where there is room for nothing more — a montage in the menu, a
   montage's card: a short segment per step, done in green and the one it is at in blue, beside the
   words that name it ("to render"), which say what the segments only show. */
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
      className={`flex gap-[3px] ${className}`}>
      {steps.map((step, i) => (
        <i
          key={step.name}
          className={`block h-1 min-w-2.5 flex-1 rounded-[2px] ${
            step.done ? 'bg-up' : i === at ? 'bg-accent' : 'bg-line'
          }`}
        />
      ))}
    </span>
  )
}

/* The whole way along, in one line: a circle per step joined to the next — a green disc with a tick
   for what is done, a ringed one with a soft halo for the step it is at, an empty one for what is
   still to come. */
const StepLine = ({ progress }: { progress: MontageProgress }) => {
  const { steps, at } = progress
  return (
    /* a glance, hidden from a reader: the panel beside it lists the same steps with what to press */
    <ol
      aria-hidden='true'
      className='m-0 flex list-none gap-0 p-0 px-1.5 py-1'>
      {steps.map((step, i) => (
        <li
          key={step.name}
          aria-current={i === at ? 'step' : undefined}
          className={`flex items-center gap-2.5 text-[13.5px] font-semibold after:mr-2.5 after:h-0.5 after:min-w-3 after:flex-1 after:content-[''] last:after:hidden flex-1 ${
            step.done
              ? 'text-ink after:bg-up'
              : i === at
                ? 'text-accent-ink after:bg-line'
                : 'text-ink-3 after:bg-line'
          }`}>
          <span
            aria-hidden='true'
            className={`grid h-[26px] w-[26px] flex-none place-items-center rounded-full border-2 ${
              step.done
                ? 'border-up bg-up text-white'
                : i === at
                  ? 'border-accent shadow-[0_0_0_4px_var(--color-accent-soft)]'
                  : 'border-line'
            }`}>
            {step.done && <Tick size={13} />}
          </span>
          {step.name}
          {step.done && <span className='sr-only'> {t`— done`}</span>}
        </li>
      ))}
    </ol>
  )
}

/* The step a montage is at, as the thing its page is asking for: which step of how many, what it is
   called, what taking it does, and the buttons that take it. Once there is a film, the film is the
   page's picture and carries the buttons itself, so the render is looked at before it is sent. */
const NextStep = ({
  progress,
  film,
  children
}: {
  progress: MontageProgress
  film?: React.ReactNode
  children: React.ReactNode
}) => {
  const { steps, at, next } = progress
  const step = steps[at]
  const n = at + 1
  const total = steps.length
  return (
    <div className='flex w-full basis-full flex-col gap-[18px]'>
      <StepLine progress={progress} />
      {film ?? (
        <div className='flex flex-col justify-center gap-2.5'>
          <span className='text-[11px] font-bold tracking-[0.08em] text-accent-ink uppercase'>
            {step ? t`Next · step ${n} of ${total}` : t`Every step done`}
          </span>
          {step && next && (
            <span className='font-display text-[27px] leading-none font-bold tracking-[-0.03em]'>
              {next.how}
            </span>
          )}
          <span className='max-w-[420px] text-[13px] text-ink-2'>
            {step
              ? i18n._(STEP_ABOUT[step.name])
              : t`Every step done — whoever it is for has their film.`}
          </span>
          <div className='mt-1'>{children}</div>
        </div>
      )}
    </div>
  )
}

export { NextStep, StepButton, StepMeter, StepTrail }
