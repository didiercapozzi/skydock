import { t } from '@lingui/core/macro'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { useSafeFetcher } from '../helpers/routing'
import { Go, Mini } from './buttons'
import { ERROR, INPUT, Modal, Spacer } from './modal'

const folderItemSchema = z
  .object({ name: z.string(), path: z.string(), is_dir: z.boolean().optional() })
  .passthrough()
const foldersResponseSchema = z.object({ folders: z.array(folderItemSchema) }).passthrough()
const folderErrorSchema = z
  .object({ globalErrors: z.array(z.string()).optional(), error: z.string().optional() })
  .passthrough()

type FolderItem = z.infer<typeof folderItemSchema>

type Props = {
  onSelect: (path: string) => void
  onClose: () => void
  /* where to open — a destination that already has a folder starts at that folder, not at / */
  initialPath?: string
  /* whose folder is being chosen, so the dialog says so when it is not the default one */
  title?: string
}

const NasFolderBrowser = ({ onSelect, onClose, initialPath, title }: Props) => {
  const fetcher = useSafeFetcher()
  const [currentPath, setCurrentPath] = useState(initialPath ?? '/')
  const [selected, setSelected] = useState<string | null>(initialPath ?? null)
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

  /* the first listing is asked for once, when the dialog appears; browsing asks for the rest */
  const listed = useRef(false)
  useEffect(() => {
    if (listed.current) return
    listed.current = true
    fetcher.submit({ url: '/api/nas', actionArgs: { intent: 'list-folder', path: currentPath } })
  }, [fetcher, currentPath])

  const parentPath =
    currentPath === '/' ? null : currentPath.split('/').slice(0, -1).join('/') || '/'
  const breadcrumbs = currentPath === '/' ? ['/'] : currentPath.split('/').filter(Boolean)

  return (
    <Modal
      data-nas-folder-dialog='true'
      label={title ?? t`Choose a storage folder`}
      title={title ?? t`Choose a storage folder`}
      onClose={onClose}
      footer={
        <>
          <Mini onClick={() => setShowCreateInput((v) => !v)}>
            {showCreateInput ? t`Cancel` : t`+ New folder`}
          </Mini>
          <Spacer />
          <Mini onClick={onClose}>{t`Cancel`}</Mini>
          <Go
            disabled={!selected}
            onClick={() => {
              if (selected) onSelect(selected)
            }}>
            {t`Use this folder`}
          </Go>
        </>
      }>
      {/* where you are, and every step of the way back to the shares */}
      <div className='flex flex-wrap items-center gap-1 font-mono text-[11.5px]'>
        <button
          type='button'
          onClick={() => load('/')}
          className='border-0 bg-transparent px-0.5 text-[11.5px] text-accent underline'>
          {t`Shares`}
        </button>
        {breadcrumbs
          .filter((b) => b !== '/')
          .map((part, idx) => {
            const path = `/${breadcrumbs
              .filter((b) => b !== '/')
              .slice(0, idx + 1)
              .join('/')}`
            return (
              <span
                key={path}
                className='flex items-center gap-1'>
                <span className='text-ink-3'>/</span>
                <button
                  type='button'
                  onClick={() => load(path)}
                  className='border-0 bg-transparent px-0.5 text-[11.5px] text-accent underline'>
                  {part}
                </button>
              </span>
            )
          })}
      </div>

      {error && <div className={ERROR}>{error}</div>}

      {showCreateInput && (
        <div className='flex gap-1.5'>
          <input
            type='text'
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder={t`Folder name`}
            aria-label={t`New folder name`}
            autoFocus
            className={`flex-1 ${INPUT}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
            }}
          />
          <Mini
            disabled={!newFolderName.trim()}
            onClick={handleCreate}>
            {t`Create`}
          </Mini>
        </div>
      )}

      <div className='max-h-[260px] overflow-auto rounded-[12px] border border-line'>
        {parentPath && (
          <button
            type='button'
            onClick={() => load(parentPath)}
            className='flex w-full items-center gap-2 border-0 border-b border-line-2 bg-transparent px-[11px] py-[7px] text-left text-[13px] text-ink-2 hover:bg-line-2'>
            <span aria-hidden='true'>↰</span>
            <span className='truncate'>{parentPath}</span>
          </button>
        )}
        {fetcher.state !== 'idle' && folders.length === 0 ? (
          <div className='px-4 py-4 text-center text-[12.5px] text-ink-3'>{t`Loading…`}</div>
        ) : folders.length > 0 ? (
          folders.map((child) => (
            <button
              key={child.path}
              type='button'
              aria-selected={selected === child.path}
              onClick={() => setSelected(child.path)}
              onDoubleClick={() => load(child.path)}
              className={`flex w-full items-center gap-2 border-0 border-b border-line-2 px-[11px] py-[7px] text-left text-[13px] last:border-b-0 ${
                selected === child.path
                  ? 'bg-accent-soft font-semibold text-accent'
                  : 'bg-transparent hover:bg-line-2'
              }`}>
              <span aria-hidden='true'>▸</span>
              <span className='truncate'>{child.name}</span>
            </button>
          ))
        ) : (
          <div className='px-4 py-4 text-center text-[12.5px] text-ink-3'>
            {t`No folders in here. Make one, or use this folder as it is.`}
          </div>
        )}
      </div>

      <span className='text-[12px] text-ink-2'>
        {t`Click to choose, double-click to open. Nothing is guessed: a dropzone with no folder is asked for one rather than filed somewhere sensible-looking.`}
      </span>
    </Modal>
  )
}

export { NasFolderBrowser }
export type { Props }
