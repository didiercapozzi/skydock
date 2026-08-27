import * as fs from 'node:fs'
import * as path from 'node:path'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useFetcher, useRevalidator } from 'react-router'
import { getOutputDirPath } from '../lib/scanner.server'
import { ensureManifestFileIds } from '../lib/fileId.server'
import { getSequences } from '../lib/sequences'
import type { Manifest, ManifestFile, ManifestJump } from '../lib/types'
import type { Route } from './+types/review'

const loader = async () => {
  const manifestPath = path.join(getOutputDirPath(), 'proposed_jumps.json')
  await ensureManifestFileIds(manifestPath)
  let manifest: Manifest | null = null
  try {
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Manifest
    }
  } catch {
    manifest = null
  }
  return { manifest }
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const formatTime = (epoch: number): string => {
  return new Date(epoch * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

type SelectionMap = Record<string, Record<string, boolean>>

const FileRow = ({
  file,
  groupId,
  selected,
  onSelect,
  onDragStart
}: {
  file: ManifestFile
  groupId: string
  selected: boolean
  onSelect: (groupId: string, filePath: string, ctrlKey: boolean, shiftKey: boolean) => void
  onDragStart: (e: React.DragEvent, filePath: string, groupId: string) => void
}) => {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded cursor-pointer select-none transition-colors ${
        selected
          ? 'bg-blue-100 dark:bg-blue-900/40 ring-1 ring-blue-300 dark:ring-blue-700'
          : 'hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
      draggable
      onDragStart={(e) => onDragStart(e, file.path, groupId)}
      onClick={(e) => onSelect(groupId, file.path, e.ctrlKey || e.metaKey, e.shiftKey)}>
      <input
        type='checkbox'
        checked={selected}
        onChange={() => {}}
        className='h-4 w-4 rounded border-gray-300 text-blue-600 pointer-events-none'
      />
      <span className='font-mono truncate flex-1 text-xs text-gray-700 dark:text-gray-300'>
        {file.filename}
      </span>
      <span className='text-gray-400 dark:text-gray-500 text-xs whitespace-nowrap tabular-nums'>
        {formatTime(file.mtime)}
      </span>
      <span className='text-gray-400 dark:text-gray-500 text-xs whitespace-nowrap'>
        {formatSize(file.size)}
      </span>
    </div>
  )
}

const JumpSection = ({
  jump,
  selection,
  onSelect,
  onDrop,
  onDragStart,
  onRemoveFiles
}: {
  jump: ManifestJump
  selection: Record<string, boolean>
  onSelect: (groupId: string, filePath: string, ctrlKey: boolean, shiftKey: boolean) => void
  onDrop: (e: React.DragEvent, targetJumpId: string) => void
  onDragStart: (e: React.DragEvent, filePaths: string[], sourceJumpId: string) => void
  onRemoveFiles: (jumpId: string, filePaths: string[]) => void
}) => {
  const [expanded, setExpanded] = useState(true)
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelValue, setLabelValue] = useState(jump.label)
  const [isDragOver, setIsDragOver] = useState(false)
  const fetcher = useFetcher()

  const selectedCount = jump.files.filter((f) => selection[f.path]).length

  const handleLabelSave = () => {
    fetcher.submit(
      { action: 'update-label', jumpId: jump.id, label: labelValue },
      { method: 'POST', encType: 'application/json', action: '/api/manifest' }
    )
    setEditingLabel(false)
  }

  const handleDelete = () => {
    fetcher.submit(
      { action: 'delete-jump', jumpId: jump.id },
      { method: 'POST', encType: 'application/json', action: '/api/manifest' }
    )
  }

  const handleConfirm = (confirmed: boolean) => {
    fetcher.submit(
      { action: 'confirm-jump', jumpId: jump.id, confirmed },
      { method: 'POST', encType: 'application/json', action: '/api/manifest' }
    )
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    setIsDragOver(false)
    onDrop(e, jump.id)
  }

  const handleRemoveSelected = () => {
    const filePaths = jump.files.filter((f) => selection[f.path]).map((f) => f.path)
    if (filePaths.length > 0) {
      onRemoveFiles(jump.id, filePaths)
    }
  }

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors mb-4 ${
        isDragOver
          ? 'border-blue-400 dark:border-blue-600 bg-blue-50/50 dark:bg-blue-900/30'
          : jump.confirmed
            ? 'border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-900/20'
            : 'border-gray-200 dark:border-gray-700'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}>
      <div className='flex items-center gap-2 px-4 py-2'>
        <input
          type='checkbox'
          checked={jump.confirmed}
          onChange={(e) => handleConfirm(e.target.checked)}
          className='h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500'
        />
        <button
          type='button'
          onClick={() => setExpanded(!expanded)}
          className='text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs'>
          {expanded ? '▼' : '▶'}
        </button>
        {editingLabel ? (
          <input
            type='text'
            value={labelValue}
            onChange={(e) => setLabelValue(e.target.value)}
            onBlur={handleLabelSave}
            onKeyDown={(e) => e.key === 'Enter' && handleLabelSave()}
            autoFocus
            className='font-semibold text-sm bg-white dark:bg-gray-800 border rounded px-1 py-0.5 w-full'
          />
        ) : (
          <span
            className='font-semibold text-sm cursor-text hover:underline flex-1'
            onClick={(e) => {
              e.stopPropagation()
              setEditingLabel(true)
            }}>
            {jump.label}
          </span>
        )}
        <span className='text-xs text-gray-400 dark:text-gray-500'>
          {jump.files.length} file{jump.files.length !== 1 ? 's' : ''}
        </span>
        {selectedCount > 0 && (
          <>
            <span className='text-xs text-blue-500 dark:text-blue-400'>
              {selectedCount} selected
            </span>
            <button
              type='button'
              onClick={handleRemoveSelected}
              className='text-xs text-red-500 hover:text-red-700'>
              Remove
            </button>
          </>
        )}
        <button
          type='button'
          onClick={handleDelete}
          className='text-gray-400 hover:text-red-500 px-1'
          title='Remove jump'>
          <svg
            className='w-4 h-4'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'>
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M6 18L18 6M6 6l12 12'
            />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className='border-t dark:border-gray-700 px-4 py-2 space-y-0.5 bg-gray-50/50 dark:bg-gray-800/50'>
          {jump.files.map((file) => (
            <FileRow
              key={file.path}
              file={file}
              groupId={jump.id}
              selected={!!selection[file.path]}
              onSelect={onSelect}
              onDragStart={(e, filePath) => {
                const selectedPaths = jump.files.filter((f) => selection[f.path]).map((f) => f.path)
                const pathsToDrag =
                  selectedPaths.length > 0 && selection[file.path] ? selectedPaths : [filePath]
                onDragStart(e, pathsToDrag, jump.id)
              }}
            />
          ))}
          {jump.files.length === 0 && (
            <p className='text-sm text-gray-400 italic py-2'>Drop files here</p>
          )}
        </div>
      )}
    </div>
  )
}

const Review = ({ loaderData }: Route.ComponentProps) => {
  const { manifest } = loaderData
  const manifestFetcher = useFetcher()
  const scanFetcher = useFetcher()
  const { revalidate } = useRevalidator()

  const [selection, setSelection] = useState<SelectionMap>({})
  const [lastClicked, setLastClicked] = useState<string | null>(null)
  const [moveTarget, setMoveTarget] = useState<string>('')
  const dragDataRef = useRef<{ filePaths: string[]; sourceJumpId: string } | null>(null)

  useEffect(() => {
    if (manifestFetcher.data || scanFetcher.data) {
      revalidate()
    }
  }, [manifestFetcher.data, scanFetcher.data, revalidate])

  const scanning = scanFetcher.state !== 'idle'

  const sequences = useMemo(() => {
    if (!manifest) return []
    return getSequences(manifest)
  }, [manifest])

  const allFileIds = useMemo(() => {
    if (!manifest) return []
    const ids: string[] = []
    for (const seq of sequences) {
      for (const file of seq.files) {
        ids.push(file.path)
      }
    }
    for (const jump of manifest.jumps) {
      for (const file of jump.files) {
        if (!ids.includes(file.path)) {
          ids.push(file.path)
        }
      }
    }
    return ids
  }, [manifest, sequences])

  const unassignedFiles = useMemo(() => {
    if (!manifest) return []
    const inJumps = new Set(manifest.jumps.flatMap((j) => j.files.map((f) => f.path)))
    return sequences.flatMap((s) => s.files.filter((f) => !inJumps.has(f.path)))
  }, [manifest, sequences])

  const handleSelect = useCallback(
    (groupId: string, filePath: string, ctrlKey: boolean, shiftKey: boolean) => {
      setSelection((prev) => {
        const next = { ...prev }
        if (!next[groupId]) next[groupId] = {}

        if (shiftKey && lastClicked) {
          const startIdx = allFileIds.indexOf(lastClicked)
          const endIdx = allFileIds.indexOf(filePath)
          if (startIdx !== -1 && endIdx !== -1) {
            const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
            for (let i = from; i <= to; i++) {
              const id = allFileIds[i]
              for (const jid of Object.keys(next)) {
                if (next[jid][id]) delete next[jid][id]
              }
              if (!next[groupId]) next[groupId] = {}
              next[groupId][id] = true
            }
          }
        } else if (ctrlKey) {
          next[groupId][filePath] = !next[groupId][filePath]
        } else {
          for (const jid of Object.keys(next)) {
            next[jid] = {}
          }
          next[groupId][filePath] = true
        }

        setLastClicked(filePath)
        return next
      })
    },
    [lastClicked, allFileIds]
  )

  const handleDragStart = useCallback(
    (e: React.DragEvent, filePaths: string[], sourceJumpId: string) => {
      dragDataRef.current = { filePaths, sourceJumpId }
      e.dataTransfer.effectAllowed = 'move'
    },
    []
  )

  const handleDrop = useCallback(
    (e: React.DragEvent, targetJumpId: string) => {
      e.preventDefault()
      const data = dragDataRef.current
      if (!data) return

      try {
        let sourceJumpId = data.sourceJumpId
        if (sourceJumpId.startsWith('seq_')) {
          for (const jump of manifest?.jumps ?? []) {
            if (jump.files.some((f) => data.filePaths.includes(f.path))) {
              sourceJumpId = jump.id
              break
            }
          }
        }

        if (sourceJumpId === targetJumpId) return

        const sourceJump = manifest?.jumps.find((j) => j.id === sourceJumpId)
        if (sourceJump) {
          manifestFetcher.submit(
            {
              action: 'move-files',
              fromJumpId: sourceJumpId,
              toJumpId: targetJumpId,
              filePaths: data.filePaths
            },
            { method: 'POST', encType: 'application/json', action: '/api/manifest' }
          )
        } else {
          manifestFetcher.submit(
            {
              action: 'add-to-jump',
              jumpId: targetJumpId,
              filePaths: data.filePaths
            },
            { method: 'POST', encType: 'application/json', action: '/api/manifest' }
          )
        }
      } finally {
        dragDataRef.current = null
      }
    },
    [manifestFetcher, manifest]
  )

  const handleRemoveFiles = useCallback(
    (jumpId: string, filePaths: string[]) => {
      manifestFetcher.submit(
        { action: 'remove-files', jumpId, filePaths },
        { method: 'POST', encType: 'application/json', action: '/api/manifest' }
      )
    },
    [manifestFetcher]
  )

  const handleMoveSelected = () => {
    if (!moveTarget || selectedFiles.length === 0) return

    const fromJumpId = selectedJumpIds.length === 1 ? selectedJumpIds[0] : ''
    if (!fromJumpId) return

    manifestFetcher.submit(
      {
        action: 'move-files',
        fromJumpId,
        toJumpId: moveTarget,
        filePaths: selectedFiles
          .filter((s) => {
            const jump = manifest?.jumps.find((j) => j.id === fromJumpId)
            return jump?.files.some((f) => f.path === s.file.path)
          })
          .map((s) => s.file.path)
      },
      { method: 'POST', encType: 'application/json', action: '/api/manifest' }
    )
    setSelection({})
    setMoveTarget('')
  }

  const selectedFiles = useMemo(() => {
    const result: { groupId: string; file: ManifestFile }[] = []
    if (!manifest) return result

    for (const seq of sequences) {
      for (const file of seq.files) {
        if (selection[seq.id]?.[file.path]) {
          result.push({ groupId: seq.id, file })
        }
      }
    }

    for (const jump of manifest.jumps) {
      for (const file of jump.files) {
        if (selection[jump.id]?.[file.path]) {
          const alreadySelected = result.some((r) => r.file.path === file.path)
          if (!alreadySelected) {
            result.push({ groupId: jump.id, file })
          }
        }
      }
    }

    return result
  }, [manifest, selection, sequences])

  const selectedCount = selectedFiles.length
  const selectedJumpIds = useMemo(() => {
    const ids = new Set(
      selectedFiles
        .map((s) => {
          if (!manifest) return null
          for (const jump of manifest.jumps) {
            if (jump.files.some((f) => f.path === s.file.path)) {
              return jump.id
            }
          }
          return null
        })
        .filter((id): id is string => id !== null)
    )
    return Array.from(ids)
  }, [selectedFiles, manifest])

  const handleConfirmAll = () => {
    manifestFetcher.submit(
      { action: 'confirm-all', confirmed: true },
      { method: 'POST', encType: 'application/json', action: '/api/manifest' }
    )
  }

  const handleCreateJump = () => {
    manifestFetcher.submit(
      { action: 'create-jump' },
      { method: 'POST', encType: 'application/json', action: '/api/manifest' }
    )
  }

  const handleConfirmAndExecute = () => {
    const confirmedJumpIds = manifest?.jumps.filter((j) => j.confirmed).map((j) => j.id) ?? []
    manifestFetcher.submit(
      { action: 'execute-jumps', jumpIds: confirmedJumpIds },
      { method: 'POST', encType: 'application/json', action: '/api/manifest' }
    )
  }

  const renderEmptyState = (title: string, description: string) => (
    <div className='min-h-screen bg-gray-50 dark:bg-gray-900'>
      <div className='max-w-7xl mx-auto px-6 py-8'>
        <div className='flex items-center justify-between mb-8'>
          <div>
            <h1 className='text-3xl font-bold'>{title}</h1>
            <p className='text-gray-500 mt-1'>{description}</p>
          </div>
          <div className='flex items-center gap-3'>
            <scanFetcher.Form
              method='post'
              action='/api/scan'>
              <button
                type='submit'
                disabled={scanning}
                className='px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer'>
                {scanning ? 'Scanning...' : 'Scan'}
              </button>
            </scanFetcher.Form>
            <Link
              to='/'
              className='text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'>
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  )

  if (!manifest) {
    return renderEmptyState('No Manifest Found', 'Run a scan first to generate proposed jumps.')
  }

  if (manifest.status === 'empty') {
    return renderEmptyState('No Files to Review', 'No new camera files were found.')
  }

  if (manifest.status === 'executed') {
    return renderEmptyState('Already Executed', 'This manifest has already been processed.')
  }

  const confirmedCount = manifest.jumps.filter((j) => j.confirmed).length
  const totalFiles = manifest.jumps.reduce((s, j) => s + j.files.length, 0)

  return (
    <div className='min-h-screen bg-gray-50 dark:bg-gray-900'>
      <div className='max-w-7xl mx-auto px-6 py-6'>
        <div className='flex items-center justify-between mb-6'>
          <div>
            <h1 className='text-3xl font-bold'>Review Proposed Jumps</h1>
            <p className='text-gray-500 mt-1'>
              {manifest.date} — {manifest.jumps.length} jump
              {manifest.jumps.length !== 1 ? 's' : ''}, {totalFiles} file
              {totalFiles !== 1 ? 's' : ''}
            </p>
          </div>
          <div className='flex items-center gap-3'>
            <scanFetcher.Form
              method='post'
              action='/api/scan'>
              <button
                type='submit'
                disabled={scanning}
                className='px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer'>
                {scanning ? 'Scanning...' : 'Scan'}
              </button>
            </scanFetcher.Form>
            <Link
              to='/'
              className='text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'>
              Back to Dashboard
            </Link>
          </div>
        </div>

        <div className='flex items-center gap-3 mb-4'>
          <button
            type='button'
            onClick={handleConfirmAll}
            className='px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50'>
            Confirm All
          </button>
          <button
            type='button'
            onClick={handleCreateJump}
            className='px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50'>
            + Add Jump
          </button>
          <button
            type='button'
            onClick={handleConfirmAndExecute}
            disabled={confirmedCount === 0}
            className={`px-6 py-2 text-sm font-medium text-white rounded-lg ${
              confirmedCount > 0
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-gray-300 cursor-not-allowed'
            }`}>
            Confirm & Execute ({confirmedCount}/{manifest.jumps.length})
          </button>
        </div>

        {selectedCount > 0 && (
          <div className='flex items-center gap-3 mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg'>
            <span className='text-sm font-medium text-blue-700 dark:text-blue-300'>
              {selectedCount} file{selectedCount !== 1 ? 's' : ''} selected
            </span>
            <div className='flex-1' />
            <select
              value={moveTarget}
              onChange={(e) => setMoveTarget(e.target.value)}
              className='px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800'>
              <option value=''>Move to jump...</option>
              {manifest.jumps.map((j) => (
                <option
                  key={j.id}
                  value={j.id}>
                  {j.label}
                </option>
              ))}
            </select>
            <button
              type='button'
              onClick={handleMoveSelected}
              disabled={!moveTarget || selectedCount === 0}
              className='px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer'>
              Move
            </button>
            <button
              type='button'
              onClick={() => setSelection({})}
              className='px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'>
              Clear
            </button>
          </div>
        )}

        <div className='flex gap-4'>
          <div className='flex-1 min-w-0'>
            {unassignedFiles.length > 0 && (
              <div className='mb-4'>
                <div className='flex items-center gap-2 mb-2 px-1'>
                  <div className='w-3 h-3 rounded-full bg-yellow-500' />
                  <h2 className='text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider'>
                    Unassigned Files ({unassignedFiles.length})
                  </h2>
                </div>
                <div className='border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 bg-yellow-50/50 dark:bg-yellow-900/10 space-y-0.5'>
                  {unassignedFiles.map((file) => (
                    <FileRow
                      key={file.path}
                      file={file}
                      groupId='unassigned'
                      selected={!!selection['unassigned']?.[file.path]}
                      onSelect={handleSelect}
                      onDragStart={(e, filePath) => handleDragStart(e, [filePath], 'unassigned')}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className='space-y-2'>
              {manifest.jumps.map((jump) => (
                <JumpSection
                  key={jump.id}
                  jump={jump}
                  selection={selection[jump.id] ?? {}}
                  onSelect={handleSelect}
                  onDrop={handleDrop}
                  onDragStart={handleDragStart}
                  onRemoveFiles={handleRemoveFiles}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Review
export { loader }
