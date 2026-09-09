import type { SubmitFunction } from 'react-router'
import { z } from 'zod'
import { Form, FormField, GlobalErrors, useForm } from '../../../packages/ui/forms'

const groupCreationSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(64, 'Title must be at most 64 characters'),
  date: z.string().min(1, 'Date is required')
})

type GroupCreationDialogProps = {
  onCreate: (title: string, day: string) => void
  onCancel: () => void
  error?: string
  initialDay?: string
}

const formatTodayDeCh = () =>
  new Date().toLocaleDateString('de-CH', { year: 'numeric', month: '2-digit', day: '2-digit' })

const toDeCh = (isoDate: string) => {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return isoDate
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`
}

const toIso = (deCh: string) => {
  const [d, m, y] = deCh.split('.').map(Number)
  if (!d || !m || !y) return new Date().toISOString().split('T')[0] ?? ''
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const GroupCreationDialog = ({
  onCreate,
  onCancel,
  error,
  initialDay
}: GroupCreationDialogProps) => {
  const defaultDay = initialDay ?? formatTodayDeCh()
  const defaultIso = toIso(defaultDay)

  const submit: SubmitFunction = async (target) => {
    const data = target as unknown as z.infer<typeof groupCreationSchema>
    const parsed = groupCreationSchema.safeParse(data)
    if (!parsed.success) return
    const day = toDeCh(parsed.data.date)
    onCreate(parsed.data.title.trim(), day)
  }

  const form = useForm({
    schema: groupCreationSchema,
    defaultValues: { title: '', date: defaultIso },
    submit
  })

  const globalErrors = error ? [error, ...form.globalErrors] : [...form.globalErrors]

  return (
    <div
      data-group-creation-dialog='true'
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
      <div className='bg-white rounded-xl shadow-xl p-6 w-full max-w-md'>
        <h2 className='text-lg font-semibold text-gray-900 mb-4'>Create New Group</h2>
        <GlobalErrors errors={globalErrors} />
        <Form
          value={form}
          className='space-y-4 mt-4'>
          <FormField
            field={form.fields.title}
            label='Title'>
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
            field={form.fields.date}
            label='Date'>
            {(control) => (
              <input
                {...control}
                type='date'
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

export { GroupCreationDialog, groupCreationSchema }
