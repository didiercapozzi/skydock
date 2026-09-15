import { destinationCreationSchema } from '@skydock/scripts'
import { useState } from 'react'
import type { SubmitFunction } from 'react-router'
import { Form, FormField, GlobalErrors, useForm } from '../../../packages/ui/forms'
import { NasFolderBrowser } from './nas-folder-browser'

type DestinationCreationDialogProps = {
  onCreate: (name: string, path?: string) => void
  onCancel: () => void
  error?: string
  initialName?: string
  initialPath?: string | null
}

const DestinationCreationDialog = ({
  onCreate,
  onCancel,
  error,
  initialName,
  initialPath
}: DestinationCreationDialogProps) => {
  const isEdit = initialName !== undefined
  const [showBrowser, setShowBrowser] = useState(false)
  const [selectedPath, setSelectedPath] = useState<string | null>(initialPath ?? null)

  const submit: SubmitFunction = async (target) => {
    const parsed = destinationCreationSchema.safeParse(target)
    if (!parsed.success) return
    onCreate(parsed.data.name.trim(), selectedPath ?? undefined)
  }

  const form = useForm({
    schema: destinationCreationSchema,
    defaultValues: { name: initialName ?? '' },
    submit
  })

  const globalErrors = error ? [error, ...form.globalErrors] : [...form.globalErrors]

  return (
    <div
      data-destination-creation-dialog='true'
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
      <div className='bg-white rounded-xl shadow-xl p-6 w-full max-w-md'>
        <h2 className='text-lg font-semibold text-gray-900 mb-4'>
          {isEdit ? 'Edit Destination' : 'Create New Destination'}
        </h2>
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
          <div>
            <label className='block text-sm font-medium text-gray-700 mb-1'>
              NAS path (optional)
            </label>
            {selectedPath ? (
              <div className='flex items-center gap-2'>
                <span className='flex-1 px-3 py-2 text-sm font-mono bg-gray-50 border border-gray-200 rounded-lg truncate'>
                  {selectedPath}
                </span>
                <button
                  type='button'
                  onClick={() => setSelectedPath(null)}
                  className='px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200'>
                  Clear
                </button>
              </div>
            ) : (
              <button
                type='button'
                onClick={() => setShowBrowser(true)}
                className='w-full px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 text-left'>
                Browse NAS folders...
              </button>
            )}
            <p className='mt-1 text-xs text-gray-400'>
              Leave empty to use the default upload folder.
            </p>
          </div>
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
              {form.isSubmitting
                ? isEdit
                  ? 'Saving...'
                  : 'Creating...'
                : isEdit
                  ? 'Save'
                  : 'Create'}
            </button>
          </div>
        </Form>
      </div>
      <NasFolderBrowser
        open={showBrowser}
        onSelect={(path) => {
          setSelectedPath(path)
          setShowBrowser(false)
        }}
        onClose={() => setShowBrowser(false)}
      />
    </div>
  )
}

export { DestinationCreationDialog }
