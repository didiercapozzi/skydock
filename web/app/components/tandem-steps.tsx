import { tandemSteps } from '@skydock/scripts'
import type { TandemFact, TandemProgress } from '@skydock/scripts'
import type { ManifestGroup } from './types'

/* Where a tandem has got to, one step under the other the way it is walked: what is done ticked in
   green and joined up, the step it is at ringed, with what to do next right under it, and what is
   still to come greyed. The whole way is there at once, so nobody has to remember what comes after
   a render. */
const StepTrail = ({
  group,
  facts,
  emailed
}: {
  group: ManifestGroup
  facts?: TandemFact
  emailed: boolean
}) => {
  const { steps, at, next } = tandemSteps({ group, facts, emailed })
  return (
    <div className='flex flex-col gap-1.5'>
      <ol
        aria-label='Where this tandem has got to'
        className='m-0 flex list-none flex-col p-0'>
        {steps.map((step, i) => {
          const now = i === at
          const last = i === steps.length - 1
          return (
            <li
              key={step.name}
              aria-current={now ? 'step' : undefined}
              className='flex gap-2.5'>
              <span
                aria-hidden='true'
                className='flex flex-col items-center'>
                <span
                  className={`grid h-5 w-5 flex-none place-items-center rounded-full text-[10.5px] font-bold ${
                    step.done
                      ? 'bg-up text-white'
                      : now
                        ? 'border-2 border-accent bg-accent-soft text-accent'
                        : 'border border-line text-ink-3'
                  }`}>
                  {step.done ? '✓' : i + 1}
                </span>
                {!last && (
                  <span className={`min-h-2.5 w-0.5 flex-1 ${step.done ? 'bg-up' : 'bg-line'}`} />
                )}
              </span>
              <span className={`flex min-w-0 flex-col ${last ? '' : 'pb-2'}`}>
                <span
                  className={`text-[12.5px] leading-5 ${
                    step.done ? 'text-up' : now ? 'font-semibold text-ink' : 'text-ink-3'
                  }`}>
                  {step.name}
                  {step.done && <span className='sr-only'> — done</span>}
                </span>
                {now && next && <span className='text-[11.5px] text-accent'>Next: {next.how}</span>}
              </span>
            </li>
          )
        })}
      </ol>
      {at === steps.length && (
        <p className='m-0 text-[12px] font-semibold text-up'>
          Every step done — the passenger has their film.
        </p>
      )}
    </div>
  )
}

/* The same way in one line, for where there is room for nothing more — a passenger in the menu, a
   tandem's card: a segment per step, done in green and the one it is at in the colour of the words
   beside it that name it ("to render"), which say what the segments only show. */
const StepMeter = ({
  progress,
  className = ''
}: {
  progress: TandemProgress
  className?: string
}) => {
  const { steps, at, next } = progress
  const said = next
    ? `Next: ${next.how} — ${at} of ${steps.length} steps done`
    : `Every step done — ${steps.length} of ${steps.length}`
  return (
    <span
      role='img'
      aria-label={said}
      title={said}
      className={`flex gap-[2px] ${className}`}>
      {steps.map((step, i) => (
        <i
          key={step.name}
          className={`block h-[3px] flex-1 rounded-sm ${
            step.done ? 'bg-up' : i === at ? 'bg-local' : 'bg-line-2'
          }`}
        />
      ))}
    </span>
  )
}

export { StepMeter, StepTrail }
