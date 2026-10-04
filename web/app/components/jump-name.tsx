import { i18n } from '@lingui/core'
import { msg, t } from '@lingui/core/macro'
import type { SubmitFunction } from 'react-router'
import { z } from 'zod'
import { Form, FormField, useForm } from '../../../packages/ui/forms'
import { Go, Mini } from './buttons'
import { fromLocalInput, toLocalInput } from './jump-time'
import { INPUT } from './modal'

const jumpFormSchema = z.object({
  name: z
    .string()
    .trim()
    .max(60, { error: () => i18n._(msg`Keep it under 60 characters`) }),
  starts: z.string().refine((value) => value === '' || fromLocalInput(value) !== null, {
    error: () => i18n._(msg`Set a date and a time`)
  })
})

const JumpForm = ({
  name = '',
  named = true,
  startsAt,
  submitLabel,
  onSubmit,
  onCancel
}: {
  name?: string
  named?: boolean
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
          label={t`Name`}
          description={t`Leave it empty to call it by its place among the jumps`}>
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
          label={t`Started`}
          description={t`Every file moves with it, keeping the gaps between them`}>
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
        <Mini onClick={onCancel}>{t`Cancel`}</Mini>
      </span>
    </Form>
  )
}

export { JumpForm }
