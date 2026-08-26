import * as fs from 'node:fs'
import * as path from 'node:path'
import { useState } from 'react'
import { Link, useFetcher, useRevalidator } from 'react-router'
import { getOutputDirPath } from '../lib/scanner.server'
import type { Manifest, ManifestFile, ManifestJump } from '../lib/types'
import type { Route } from './+types/review'

const loader = async () => {
  const manifestPath = path.join(getOutputDirPath(), 'proposed_jumps.json')
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

const FileRow = ({ file }: { file: ManifestFile }) => {
  const time = new Date(file.mtime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const isPhoto = file.camera === 'PHOTO'
  return (
    <div className='flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 rounded'>
      <span
        className={`px-2 py-0.5 rounded text-xs font-medium ${
          isPhoto
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
            : 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
        }`}>
        {isPhoto ? 'PHOTO' : 'VIDEO'}
      </span>
      <span className='font-mono text-gray-600 dark:text-gray-400 truncate flex-1'>
        {file.filename}
      </span>
      <span className='text-gray-400 dark:text-gray-500 text-xs whitespace-nowrap'>{time}</span>
      <span className='text-gray-400 dark:text-gray-500 text-xs whitespace-nowrap'>
        {formatSize(file.size)}
      </span>
    </div>
  )
}

const JumpCard = ({
  jump,
  manifestFetcher
}: {
  jump: ManifestJump
  manifestFetcher: ReturnType<typeof useFetcher>
}) => {
  const [expanded, setExpanded] = useState(false)
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelValue, setLabelValue] = useState(jump.label)

  const photoCount = jump.files.filter((f) => f.camera === 'PHOTO').length
  const videoCount = jump.files.filter((f) => f.camera === 'VIDEO').length
  const totalSize = jump.files.reduce((s, f) => s + f.size, 0)

  const handleLabelSave = () => {
    manifestFetcher.submit(
      { action: 'update-label', jumpId: jump.id, label: labelValue },
      { method: 'POST', encType: 'application/json', action: '/api/manifest' }
    )
    setEditingLabel(false)
  }

  const handleConfirm = (confirmed: boolean) => {
    manifestFetcher.submit(
      { action: 'confirm-jump', jumpId: jump.id, confirmed },
      { method: 'POST', encType: 'application/json', action: '/api/manifest' }
    )
  }

  const handleDelete = () => {
    manifestFetcher.submit(
      { action: 'delete-jump', jumpId: jump.id },
      { method: 'POST', encType: 'application/json', action: '/api/manifest' }
    )
  }

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors ${
        jump.confirmed
          ? 'border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-900/20'
          : 'border-gray-200 dark:border-gray-700'
      }`}>
      <div className='flex items-center gap-3 px-4 py-3'>
        <input
          type='checkbox'
          checked={jump.confirmed}
          onChange={(e) => handleConfirm(e.target.checked)}
          className='h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500'
        />

        <button
          type='button'
          onClick={() => setExpanded(!expanded)}
          className='flex-1 text-left'>
          {editingLabel ? (
            <input
              type='text'
              value={labelValue}
              onChange={(e) => setLabelValue(e.target.value)}
              onBlur={handleLabelSave}
              onKeyDown={(e) => e.key === 'Enter' && handleLabelSave()}
              autoFocus
              className='font-semibold text-lg bg-white dark:bg-gray-800 border rounded px-2 py-0.5 w-full'
            />
          ) : (
            <span
              className='font-semibold text-lg cursor-text hover:underline'
              onClick={(e) => {
                e.stopPropagation()
                setEditingLabel(true)
              }}>
              {jump.label}
            </span>
          )}
        </button>

        <div className='flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400'>
          <span>
            {photoCount} photo{photoCount !== 1 ? 's' : ''}
          </span>
          <span>
            {videoCount} video{videoCount !== 1 ? 's' : ''}
          </span>
          <span>{formatSize(totalSize)}</span>
        </div>

        <button
          type='button'
          onClick={handleDelete}
          className='text-gray-400 hover:text-red-500 px-2'
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
        <div className='border-t dark:border-gray-700 px-4 py-2 space-y-1 bg-gray-50/50 dark:bg-gray-800/50'>
          {jump.files.map((file, i) => (
            <FileRow
              key={`${file.path}-${i}`}
              file={file}
            />
          ))}
          {jump.files.length === 0 && (
            <p className='text-sm text-gray-400 italic py-2'>No files in this jump</p>
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

  if (manifestFetcher.data || scanFetcher.data) {
    revalidate()
  }

  const scanning = scanFetcher.state !== 'idle'

  const renderEmptyState = (title: string, description: string) => (
    <div className='min-h-screen bg-gray-50 dark:bg-gray-900'>
      <div className='max-w-4xl mx-auto px-6 py-8'>
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
    manifestFetcher.submit(
      { action: 'confirm' },
      { method: 'POST', encType: 'application/json', action: '/api/manifest' }
    )
  }

  return (
    <div className='min-h-screen bg-gray-50 dark:bg-gray-900'>
      <div className='max-w-4xl mx-auto px-6 py-8'>
        <div className='flex items-center justify-between mb-8'>
          <div>
            <h1 className='text-3xl font-bold'>Review Proposed Jumps</h1>
            <p className='text-gray-500 mt-1'>
              {manifest.date} — {manifest.jumps.length} jump{manifest.jumps.length !== 1 ? 's' : ''}
              , {totalFiles} file{totalFiles !== 1 ? 's' : ''}
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

        <div className='flex items-center gap-3 mb-6'>
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
          <div className='flex-1' />
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

        <div className='space-y-3'>
          {manifest.jumps.map((jump) => (
            <JumpCard
              key={jump.id}
              jump={jump}
              manifestFetcher={manifestFetcher}
            />
          ))}
        </div>

        {manifest.theory.length > 0 && (
          <div className='mt-8'>
            <h2 className='text-lg font-semibold mb-3'>Theory Files ({manifest.theory.length})</h2>
            <div className='border rounded-lg divide-y dark:divide-gray-700 dark:border-gray-700'>
              {manifest.theory.map((file, i) => (
                <FileRow
                  key={`theory-${i}`}
                  file={file}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Review
export { loader }
