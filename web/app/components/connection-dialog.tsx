import type { SubmitFunction } from 'react-router'
import { z } from 'zod'
import { Form, FormField, GlobalErrors, useForm } from '../../../packages/ui/forms'
import { Go, Mini } from './buttons'
import { INPUT, Modal, Spacer } from './modal'

const connectionSchema = z.object({
  host: z
    .string()
    .min(1, 'Hostname is required')
    .url('Must be a valid URL (e.g. https://nas.local:5001)'),
  user: z.string().min(1, 'Username is required').min(2, 'Username must be at least 2 characters'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(3, 'Password must be at least 3 characters')
})

/* the footer's Connect lives outside the form element, and this is how it still submits it */
const FORM_ID = 'nas-connect'

type ConnectionDialogProps = {
  onConnect: (host: string, user: string, password: string) => void
  onCancel: () => void
  error?: string
}

const ConnectionDialog = ({ onConnect, onCancel, error }: ConnectionDialogProps) => {
  const submit: SubmitFunction = async (target) => {
    const parsed = connectionSchema.safeParse(target)
    if (!parsed.success) return
    onConnect(parsed.data.host, parsed.data.user, parsed.data.password)
  }

  const form = useForm({
    schema: connectionSchema,
    defaultValues: { host: '', user: '', password: '' },
    submit
  })

  const globalErrors = error ? [error, ...form.globalErrors] : [...form.globalErrors]

  return (
    <Modal
      data-connection-dialog='true'
      label='Connect to the NAS'
      title='Connect to NAS'
      onClose={form.isSubmitting ? undefined : onCancel}
      footer={
        <>
          <Spacer />
          <Mini
            disabled={form.isSubmitting}
            onClick={onCancel}>
            Cancel
          </Mini>
          <Go
            type='submit'
            form={FORM_ID}
            disabled={form.isSubmitting}>
            {form.isSubmitting ? 'Connecting…' : 'Connect'}
          </Go>
        </>
      }>
      <GlobalErrors errors={globalErrors} />
      <Form
        id={FORM_ID}
        value={form}
        className='flex flex-col gap-2.5'>
        <FormField
          field={form.fields.host}
          label='NAS Hostname'>
          {(control) => (
            <input
              {...control}
              type='text'
              placeholder='https://nas.local:5001'
              className={`w-full ${INPUT}`}
            />
          )}
        </FormField>
        <FormField
          field={form.fields.user}
          label='Username'>
          {(control) => (
            <input
              {...control}
              type='text'
              placeholder='admin'
              className={`w-full ${INPUT}`}
            />
          )}
        </FormField>
        <FormField
          field={form.fields.password}
          label='Password'>
          {(control) => (
            <input
              {...control}
              type='password'
              placeholder='••••••••'
              className={`w-full ${INPUT}`}
            />
          )}
        </FormField>
      </Form>
    </Modal>
  )
}

export { ConnectionDialog, connectionSchema }
