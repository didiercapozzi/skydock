import type { SubmitFunction } from 'react-router'
import { z } from 'zod'
import { Form, FormField, useForm } from '../../../packages/ui/forms'
import { Go, Mini } from './buttons'
import { fromLocalInput, toLocalInput } from './jump-time'
import { INPUT } from './modal'

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
   them as one jump, and the camera that shot them was on the wrong clock. */
const JumpForm = ({
  name = '',
  named = true,
  startsAt,
  submitLabel,
  onSubmit,
  onCancel
}: {
  name?: string
  /* false for a jump made from picked files in Fresh files, which has no name: a name there is a
     montage's, made with its own button */
  named?: boolean
  /* given when the jump is being made, so its start can be set in the same step */
  startsAt?: number
  submitLabel: string
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

  return (
    <Form
      value={form}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel()
      }}
      className='flex flex-col gap-2'>
      {named && (
        <FormField
          field={form.fields.name}
          label='Name'
          description='Leave it empty to call it by its place among the jumps'>
          {(control) => (
            <input
              {...control}
              type='text'
              autoFocus
              className={`w-full ${INPUT}`}
            />
          )}
        </FormField>
      )}
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
        <Go type='submit'>{submitLabel}</Go>
        <Mini onClick={onCancel}>Cancel</Mini>
      </span>
    </Form>
  )
}

export { JumpForm }
