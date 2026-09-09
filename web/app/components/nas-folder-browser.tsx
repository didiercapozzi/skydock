import { useState } from 'react'
import { z } from 'zod'
import { useSafeFetcher } from '../helpers/routing'

const folderItemSchema = z.object({ name: z.string(), path: z.string() })
const foldersResponseSchema = z.object({ folders: z.array(folderItemSchema) })
const folderErrorSchema = z
  .object({ globalErrors: z.array(z.string()).optional(), error: z.string().optional() })
  .passthrough()

type FolderItem = z.infer<typeof folderItemSchema>

type Props = {
  open: boolean
  onSelect: (path: string) => void
  onClose: () => void
}

const NasFolderBrowser = ({ open, onSelect, onClose }: Props) => {
  const fetcher = useSafeFetcher()
  const [currentPath, setCurrentPath] = useState('/home')
  const [selected, setSelected] = useState<string | null>(null)

  const parsedFolders = foldersResponseSchema.safeParse(fetcher.data)
  const parsedError = folderErrorSchema.safeParse(fetcher.data)
  const folders: readonly FolderItem[] = parsedFolders.success ? parsedFolders.data.folders : []
  const error = parsedError.success
    ? (parsedError.data.globalErrors?.[0] ?? parsedError.data.error)
    : undefined

  const load = (path: string) => {
    setCurrentPath(path)
    fetcher.submit({ url: '/api/nas', actionArgs: { intent: 'list-folder', path } })
  }

  if (!open) return null

  return (
    <div
      data-nas-folder-dialog='true'
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
      <div className='bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[70vh] flex flex-col'>
        <div className='px-6 py-4 border-b border-gray-100'>
          <h2 className='text-lg font-semibold text-gray-900'>Choose NAS Folder</h2>
          <p className='text-xs text-gray-500 mt-1'>
            Select the destination folder for uploads. Required before first upload.
          </p>
        </div>
        <div className='flex-1 overflow-auto px-4 py-3'>
          {error && (
            <div className='mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700'>
              {error}
            </div>
          )}
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer text-sm mb-2 ${selected === '/home' ? 'bg-blue-100 text-blue-800' : 'hover:bg-gray-100'}`}
            onClick={() => {
              setSelected('/home')
              load('/home')
            }}>
            <span className='font-medium'>/home</span>
            <span className='text-xs text-gray-400'>(root)</span>
          </div>
          {fetcher.state !== 'idle' && folders.length === 0 ? (
            <div className='text-xs text-gray-400'>Loading...</div>
          ) : folders.length > 0 ? (
            <div className='flex flex-col gap-1'>
              {currentPath !== '/home' && (
                <button
                  type='button'
                  onClick={() => {
                    const parent = currentPath.split('/').slice(0, -1).join('/') || '/home'
                    load(parent)
                  }}
                  className='text-xs text-blue-600 hover:text-blue-800 self-start'>
                  ← Back to {currentPath.split('/').slice(0, -1).join('/') || '/home'}
                </button>
              )}
              {folders.map((child) => {
                const isSelected = selected === child.path
                return (
                  <div
                    key={child.path}
                    className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer text-sm ${isSelected ? 'bg-blue-100 text-blue-800' : 'hover:bg-gray-100'}`}
                    onClick={() => {
                      setSelected(child.path)
                      load(child.path)
                    }}>
                    <span className='truncate'>{child.name}</span>
                    <span className='ml-auto text-xs text-gray-400 truncate hidden sm:inline'>
                      {child.path}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className='text-xs text-gray-400'>No folders</div>
          )}
        </div>
        <div className='px-6 py-4 border-t border-gray-100 flex justify-end gap-3'>
          <button
            type='button'
            onClick={onClose}
            className='px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200'>
            Cancel
          </button>
          <button
            type='button'
            disabled={!selected}
            onClick={() => {
              if (selected) onSelect(selected)
            }}
            className='px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'>
            Select
          </button>
        </div>
      </div>
    </div>
  )
}

export { NasFolderBrowser }
export type { Props }
