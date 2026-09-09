import type { SubmitFunction } from 'react-router'
import { z } from 'zod'
import { Form, FormField, GlobalErrors, useForm } from '../../../packages/ui/forms'

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
    <div
      data-connection-dialog='true'
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
      <div className='bg-white rounded-xl shadow-xl p-6 w-full max-w-md'>
        <h2 className='text-lg font-semibold text-gray-900 mb-4'>Connect to NAS</h2>
        <GlobalErrors errors={globalErrors} />
        <Form
          value={form}
          className='space-y-4 mt-4'>
          <FormField
            field={form.fields.host}
            label='NAS Hostname'>
            {(control) => (
              <input
                {...control}
                type='text'
                placeholder='https://nas.local:5001'
                className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50'
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
                className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50'
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
                className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50'
              />
            )}
          </FormField>
          <div className='flex justify-end gap-3 pt-2'>
            <button
              type='button'
              onClick={onCancel}
              disabled={form.isSubmitting}
              className='px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50'>
              Cancel
            </button>
            <button
              type='submit'
              disabled={form.isSubmitting}
              className='px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50'>
              {form.isSubmitting ? 'Connecting...' : 'Connect'}
            </button>
          </div>
        </Form>
      </div>
    </div>
  )
}

export { ConnectionDialog, connectionSchema }
