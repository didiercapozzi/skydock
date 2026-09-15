import type { SubmitFunction } from 'react-router'
import { z } from 'zod'
import { Form, FormField, GlobalErrors, useForm } from '../../../packages/ui/forms'

const destinationCreationSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(64, 'Name must be at most 64 characters'),
  type: z.enum(['location', 'passenger']),
  path: z.string().trim().optional()
})

type DestinationCreationDialogProps = {
  onCreate: (name: string, type: 'location' | 'passenger', path?: string) => void
  onCancel: () => void
  error?: string
}

const DestinationCreationDialog = ({
  onCreate,
  onCancel,
  error
}: DestinationCreationDialogProps) => {
  const submit: SubmitFunction = async (target) => {
    const parsed = destinationCreationSchema.safeParse(target)
    if (!parsed.success) return
    const path =
      parsed.data.path && parsed.data.path.trim() !== '' ? parsed.data.path.trim() : undefined
    onCreate(parsed.data.name.trim(), parsed.data.type, path)
  }

  const form = useForm({
    schema: destinationCreationSchema,
    defaultValues: { name: '', type: 'location' as const, path: '' },
    submit
  })

  const globalErrors = error ? [error, ...form.globalErrors] : [...form.globalErrors]

  return (
    <div
      data-destination-creation-dialog='true'
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
      <div className='bg-white rounded-xl shadow-xl p-6 w-full max-w-md'>
        <h2 className='text-lg font-semibold text-gray-900 mb-4'>Create New Destination</h2>
        <GlobalErrors errors={globalErrors} />
        <Form
          value={form}
          className='space-y-4 mt-4'>
          <FormField
            field={form.fields.name}
            label='Name'>
            {(control) => (
              <input
                {...control}
                type='text'
                placeholder='yverdon'
                className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50'
              />
            )}
          </FormField>
          <FormField
            field={form.fields.type}
            label='Type'>
            {(control) => (
              <select
                {...control}
                className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50'>
                <option value='location'>Location</option>
                <option value='passenger'>Passenger</option>
              </select>
            )}
          </FormField>
          <FormField
            field={form.fields.path}
            label='NAS path (optional — leave empty for default)'>
            {(control) => (
              <input
                {...control}
                type='text'
                placeholder='/volume1/.../skydive/yverdon'
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
              {form.isSubmitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </Form>
      </div>
    </div>
  )
}

export { DestinationCreationDialog, destinationCreationSchema }
