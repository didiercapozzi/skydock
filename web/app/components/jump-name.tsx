import { passengerFrom, passengerName } from '@skydock/scripts'
import type { SubmitFunction } from 'react-router'
import { z } from 'zod'
import { Form, FormField, useForm } from '../../../packages/ui/forms'
import { Go, Mini } from './buttons'
import { fromLocalInput, toLocalInput } from './jump-time'
import { INPUT } from './modal'
import type { Passenger } from './tandem-card'

/* Blank is an answer too: a jump nobody named is called by its place among the jumps, as every jump the
   scan finds is. */
const jumpFormSchema = z.object({
  name: z.string().trim().max(60, 'Keep it under 60 characters'),
  starts: z
    .string()
    .refine((value) => value === '' || fromLocalInput(value) !== null, 'Set a date and a time')
})

/* What a jump is called, and — while it is being made — when it started. Both at once, because files
   picked out of Unsorted are usually picked for exactly those two reasons: the gap rule did not see
   them as one jump, and the camera that shot them was on the wrong clock.

   Made from files in Fresh files, naming is making: with a name they become a montage of that name —
   joining one that has it already — and left blank they are just a jump. The button says which. */
const JumpForm = ({
  name = '',
  startsAt,
  submitLabel,
  montages,
  onSubmit,
  onCancel
}: {
  name?: string
  /* given when the jump is being made, so its start can be set in the same step */
  startsAt?: number
  submitLabel: string
  /* given when a name makes a montage: the ones there are, for a name to join */
  montages?: Passenger[]
  onSubmit: (name: string, startsAt?: number) => void
  onCancel: () => void
}) => {
  const submit: SubmitFunction = async (target) => {
    const parsed = jumpFormSchema.safeParse(target)
    if (!parsed.success) return
    onSubmit(parsed.data.name, fromLocalInput(parsed.data.starts) ?? undefined)
  }

  const form = useForm({
    schema: jumpFormSchema,
    defaultValues: { name, starts: startsAt === undefined ? '' : toLocalInput(startsAt) },
    submit
  })

  const typed = passengerName(passengerFrom(form.values.name ?? ''))
  const joins = montages?.find((m) => passengerName(m).toLowerCase() === typed.toLowerCase())
  const making = montages !== undefined && typed !== ''
  return (
    <Form
      value={form}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel()
      }}
      className='flex flex-col gap-2'>
      <FormField
        field={form.fields.name}
        label='Name'
        description={
          montages === undefined
            ? 'Leave it empty to call it by its place among the jumps'
            : joins
              ? `Joins ${passengerName(joins)}’s montage`
              : 'With a name they become a montage. Left blank, they are just a jump.'
        }>
        {(control) => (
          <input
            {...control}
            type='text'
            autoFocus
            className={`w-full ${INPUT}`}
          />
        )}
      </FormField>
      {startsAt !== undefined && (
        <FormField
          field={form.fields.starts}
          label='Started'
          description='Every file moves with it, keeping the gaps between them'>
          {(control) => (
            <input
              {...control}
              type='datetime-local'
              step='1'
              className={`w-full ${INPUT}`}
            />
          )}
        </FormField>
      )}
      <span className='flex gap-1.5'>
        <Go type='submit'>
          {making ? (joins ? 'Join montage' : 'Make the montage') : submitLabel}
        </Go>
        <Mini onClick={onCancel}>Cancel</Mini>
      </span>
    </Form>
  )
}

export { JumpForm }
