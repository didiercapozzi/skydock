import { useEffect, useState } from 'react'
import { z } from 'zod'
import { useSafeFetcher } from '../helpers/routing'

const folderItemSchema = z
  .object({ name: z.string(), path: z.string(), is_dir: z.boolean().optional() })
  .passthrough()
const foldersResponseSchema = z.object({ folders: z.array(folderItemSchema) }).passthrough()
const folderErrorSchema = z
  .object({ globalErrors: z.array(z.string()).optional(), error: z.string().optional() })
  .passthrough()

type FolderItem = z.infer<typeof folderItemSchema>

type Props = {
  open: boolean
  onSelect: (path: string) => void
  onClose: () => void
  /* where to open — a destination that already has a folder starts at that folder, not at / */
  initialPath?: string
  /* whose folder is being chosen, so the dialog says so when it is not the default one */
  title?: string
}

const NasFolderBrowser = ({ open, onSelect, onClose, initialPath, title }: Props) => {
  const fetcher = useSafeFetcher()
  const [currentPath, setCurrentPath] = useState('/')
  const [selected, setSelected] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [showCreateInput, setShowCreateInput] = useState(false)

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

  const handleCreate = () => {
    const trimmed = newFolderName.trim()
    if (!trimmed) return
    fetcher.submit({
      url: '/api/nas',
      actionArgs: { intent: 'create-folder', path: currentPath, name: trimmed }
    })
    setNewFolderName('')
    setShowCreateInput(false)
  }

  useEffect(() => {
    if (open) {
      load(initialPath ?? currentPath)
      setSelected(initialPath ?? null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPath])

  useEffect(() => {
    if (parsedFolders.success) setNewFolderName('')
  }, [parsedFolders.success])

  if (!open) return null

  const parentPath =
    currentPath === '/' ? null : currentPath.split('/').slice(0, -1).join('/') || '/'
  const breadcrumbs = currentPath === '/' ? ['/'] : currentPath.split('/').filter(Boolean)

  return (
    <div
      data-nas-folder-dialog='true'
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
      <div className='bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[70vh] flex flex-col'>
        <div className='px-6 py-4 border-b border-gray-100'>
          <h2 className='text-lg font-semibold text-gray-900'>{title ?? 'Choose NAS Folder'}</h2>
          <p className='text-xs text-gray-500 mt-1'>
            Select the destination folder for uploads. Browsing live NAS. Required before first
            upload.
          </p>
          <div className='mt-2 flex items-center gap-1 text-xs text-gray-500 flex-wrap'>
            <span className='font-medium'>Current:</span>
            <span className='font-mono bg-gray-100 px-1.5 py-0.5 rounded'>{currentPath}</span>
          </div>
          <div className='mt-1 flex items-center gap-1 text-xs flex-wrap'>
            <button
              type='button'
              onClick={() => load('/')}
              className={`px-1.5 py-0.5 rounded ${currentPath === '/' ? 'bg-blue-100 text-blue-800' : 'hover:bg-gray-100'}`}>
              /
            </button>
            {breadcrumbs
              .filter((b) => b !== '/')
              .map((part, idx) => {
                const path = `/${breadcrumbs
                  .filter((b) => b !== '/')
                  .slice(0, idx + 1)
                  .join('/')}`
                const isCurrent = path === currentPath
                return (
                  <span
                    key={path}
                    className='flex items-center gap-1'>
                    <span className='text-gray-300'>/</span>
                    <button
                      type='button'
                      onClick={() => load(path)}
                      className={`px-1 py-0.5 rounded ${isCurrent ? 'bg-blue-100 text-blue-800' : 'hover:bg-gray-100 text-blue-600'}`}>
                      {part}
                    </button>
                  </span>
                )
              })}
          </div>
        </div>
        <div className='flex-1 overflow-auto px-4 py-3'>
          {error && (
            <div className='mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700'>
              {error}
            </div>
          )}
          <div className='flex items-center justify-between mb-2'>
            <span className='text-xs font-medium text-gray-600'>
              {currentPath === '/' ? 'Shares' : `Folders in ${currentPath}`}
            </span>
            <button
              type='button'
              onClick={() => setShowCreateInput((v) => !v)}
              className='text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded-md font-medium'>
              {showCreateInput ? 'Cancel' : '+ Create Folder'}
            </button>
          </div>
          {showCreateInput && (
            <div className='mb-3 flex gap-2'>
              <input
                type='text'
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder='New folder name'
                aria-label='New folder name'
                className='flex-1 px-2 py-1 text-sm border border-gray-300 rounded-md'
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate()
                }}
              />
              <button
                type='button'
                disabled={!newFolderName.trim()}
                onClick={handleCreate}
                className='px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50'>
                Create
              </button>
            </div>
          )}
          {parentPath && (
            <button
              type='button'
              onClick={() => load(parentPath)}
              className='text-xs text-blue-600 hover:text-blue-800 self-start mb-2 flex items-center gap-1'>
              ← Back to {parentPath}
            </button>
          )}
          {fetcher.state !== 'idle' && folders.length === 0 ? (
            <div className='text-xs text-gray-400'>Loading...</div>
          ) : folders.length > 0 ? (
            <div className='flex flex-col gap-1'>
              {folders.map((child) => {
                const isSelected = selected === child.path
                return (
                  <div
                    key={child.path}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm border ${isSelected ? 'bg-blue-100 text-blue-800 border-blue-200' : 'hover:bg-gray-100 border-transparent'}`}
                    onClick={() => {
                      setSelected(child.path)
                    }}
                    onDoubleClick={() => {
                      load(child.path)
                    }}>
                    <span className='text-gray-400'>📁</span>
                    <span className='truncate font-medium'>{child.name}</span>
                    <span className='ml-auto text-xs text-gray-400 truncate hidden sm:inline font-mono'>
                      {child.path}
                    </span>
                    <button
                      type='button'
                      onClick={(e) => {
                        e.stopPropagation()
                        load(child.path)
                      }}
                      className='ml-1 text-xs px-1.5 py-0.5 bg-white border border-gray-200 rounded hover:bg-gray-50'>
                      Open
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className='text-xs text-gray-400 py-2'>No folders. Create one or go back.</div>
          )}
          {selected && (
            <div className='mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs'>
              Selected: <span className='font-mono font-medium'>{selected}</span>
            </div>
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
