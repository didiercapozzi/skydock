import { dayToIso, isoToDay } from '@skydock/scripts'
import { Fragment, useEffect, useRef, useState } from 'react'
import type { UploadProgressState } from '../hooks/useUploadProgress'
import { FileGrid } from './file-grid'
import { FileRow } from './file-row'
import { PhotoIcon, VideoIcon } from './icons'
import type { ManifestFile, ManifestJump, SelectionMap } from './types'
import { formatTime, getJumpBounds, isVideoFile } from './utils'

const JumpCard = ({
  jump,
  selection,
  multiJumpPaths,
  previewedPath,
  dropIndex,
  onSelect,
  onPreview,
  onDragStart,
  onDragEnd,
  onDrop,
  onDragOver,
  onDragLeave,
  onLabelChange,
  onProcess,
  processing,
  onUpload,
  uploading,
  nasConnected,
  hasUploadFolder,
  viewMode,
  hasSelection,
  onRemoveGroup,
  onGroupDateChange,
  onGroupTimeChange,
  uploadProgress,
  onImportFile,
  importing
}: {
  jump: ManifestJump
  selection: SelectionMap
  multiJumpPaths: Set<string>
  previewedPath: string | null
  dropIndex: number | null
  onSelect: (groupId: string, path: string, ctrl: boolean, shift: boolean) => void
  onPreview: (file: ManifestFile, groupId: string) => void
  onDragStart?: (e: React.DragEvent, groupId: string, paths: string[]) => void
  onDragEnd?: () => void
  onDrop?: (e: React.DragEvent, targetJumpId: string) => void
  onDragOver?: (e: React.DragEvent, targetJumpId: string) => void
  onDragLeave?: (jumpId: string) => void
  onLabelChange: (jumpId: string, label: string) => void
  onProcess: (jumpId: string) => void
  processing: boolean
  onUpload: (jumpId: string) => void
  uploading: boolean
  nasConnected: boolean
  hasUploadFolder: boolean
  viewMode: 'list' | 'grid'
  hasSelection: boolean
  onRemoveGroup: (jumpId: string) => void
  onGroupDateChange: (jumpId: string, day: string) => void
  onGroupTimeChange: (jumpId: string, anchorEpoch: number) => void
  uploadProgress?: UploadProgressState | null
  onImportFile?: (jumpId: string, files: File[]) => void
  importing?: boolean
}) => {
  const [expanded, setExpanded] = useState(false)
  const [editingDate, setEditingDate] = useState(false)
  const [editingTime, setEditingTime] = useState(false)
  const [editingLabel, setEditingLabel] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [draftLabel, setDraftLabel] = useState('')
  const [draftDate, setDraftDate] = useState('')
  const [draftTime, setDraftTime] = useState('')
  const cardRef = useRef<HTMLDivElement>(null)
  const bounds = getJumpBounds(jump)
  const videoCount = jump.files.filter((f) => isVideoFile(f.filename)).length
  const photoCount = jump.files.length - videoCount
  const croppedCount = jump.files.filter(
    (f) => isVideoFile(f.filename) && (f.cropStart != null || f.cropEnd != null)
  ).length
  const canProcess = jump.files.length > 0
  const processTitle = jump.files.length === 0 ? 'Empty jump' : undefined
  const uploadTitle =
    jump.processed !== true
      ? 'Process the jump first'
      : !nasConnected
        ? 'Connect to NAS to upload'
        : !hasUploadFolder
          ? 'Choose an upload folder first'
          : undefined
  const locked = uploading || (!!uploadProgress && uploadProgress.jumpId === jump.id)
  const isUploadingJump = locked
  const canImport = !!onImportFile

  const onImportFileRef = useRef(onImportFile)
  const canImportRef = useRef(canImport)
  const dragCounterRef = useRef(0)
  const [osDragOver, setOsDragOver] = useState(false)

  useEffect(() => {
    onImportFileRef.current = onImportFile
    canImportRef.current = canImport
  })

  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    const onEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      if (!canImportRef.current) return
      dragCounterRef.current++
      if (dragCounterRef.current === 1) setOsDragOver(true)
    }
    const onLeave = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      dragCounterRef.current--
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0
        setOsDragOver(false)
      }
    }
    const onOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      if (!canImportRef.current) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
    const onDropped = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      if (!canImportRef.current) return
      e.preventDefault()
      e.stopPropagation()
      dragCounterRef.current = 0
      setOsDragOver(false)
      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0) onImportFileRef.current?.(jump.id, files)
    }
    card.addEventListener('dragenter', onEnter)
    card.addEventListener('dragleave', onLeave)
    card.addEventListener('dragover', onOver)
    card.addEventListener('drop', onDropped)
    return () => {
      card.removeEventListener('dragenter', onEnter)
      card.removeEventListener('dragleave', onLeave)
      card.removeEventListener('dragover', onOver)
      card.removeEventListener('drop', onDropped)
    }
  }, [jump.id])

  const openLabelEditor = () => {
    if (locked) return
    setDraftLabel(jump.label)
    setEditingLabel(true)
  }

  const saveLabelEditor = () => {
    const trimmed = draftLabel.trim()
    if (trimmed && trimmed !== jump.label) onLabelChange(jump.id, trimmed)
    setEditingLabel(false)
  }

  const cancelLabelEditor = () => {
    setEditingLabel(false)
  }

  const openDateEditor = () => {
    if (locked) return
    setDraftDate(dayToIso(jump.day))
    setEditingDate(true)
  }

  const saveDateEditor = () => {
    if (!draftDate) return
    try {
      const deCh = isoToDay(draftDate)
      onGroupDateChange(jump.id, deCh)
      setEditingDate(false)
    } catch {}
  }

  const cancelDateEditor = () => {
    setEditingDate(false)
  }

  const toTimeInputValue = (epoch: number) => {
    const d = new Date(epoch * 1000)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
  }

  const openTimeEditor = () => {
    if (locked) return
    setDraftTime(toTimeInputValue(bounds.start))
    setEditingTime(true)
  }

  const saveTimeEditor = () => {
    if (!draftTime) return
    const [hours, minutes, seconds] = draftTime.split(':').map(Number)
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return
    const currentDate = new Date(bounds.start * 1000)
    const anchor = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      currentDate.getDate(),
      hours,
      minutes,
      Number.isFinite(seconds) ? seconds : 0
    )
    const anchorEpoch = Math.floor(anchor.getTime() / 1000)
    onGroupTimeChange(jump.id, anchorEpoch)
    setEditingTime(false)
  }

  const cancelTimeEditor = () => {
    setEditingTime(false)
  }

  const copyShareLink = async () => {
    if (!jump.publish?.shareUrl) return
    try {
      await navigator.clipboard.writeText(jump.publish.shareUrl)
      setLinkCopied(true)
    } catch {
      setLinkCopied(false)
    }
  }

  return (
    <div
      ref={cardRef}
      data-jump-card='true'
      onDragOver={(e) => {
        if (locked) return
        e.preventDefault()
        onDragOver?.(e, jump.id)
      }}
      onDrop={(e) => {
        if (locked) return
        e.preventDefault()
        onDrop?.(e, jump.id)
      }}
      onDragLeave={() => {
        if (locked) return
        onDragLeave?.(jump.id)
      }}
      className={`relative border rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden ${
        osDragOver ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-200'
      } ${locked ? 'opacity-80 pointer-events-none' : ''}`}>
      {osDragOver && (
        <div className='absolute inset-0 z-20 flex items-center justify-center bg-blue-50/80 rounded-xl pointer-events-none'>
          <span className='text-sm font-medium text-blue-700'>
            {jump.processed === true ? 'Drop to import' : 'Drop to add to jump'}
          </span>
        </div>
      )}
      <div
        data-jump-card-toggle='true'
        onClick={() => setExpanded(!expanded)}
        className='px-4 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 cursor-pointer select-none'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-3'>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'
              strokeWidth={2}>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M9 5l7 7-7 7'
              />
            </svg>
            {editingLabel ? (
              <div
                className='flex items-center gap-2'
                onClick={(e) => e.stopPropagation()}>
                <input
                  type='text'
                  value={draftLabel}
                  onChange={(e) => setDraftLabel(e.target.value)}
                  className='px-2 py-1 text-sm font-semibold border border-gray-300 rounded-md bg-white min-w-[120px]'
                />
                <button
                  type='button'
                  onClick={saveLabelEditor}
                  className='px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700'>
                  Done
                </button>
                <button
                  type='button'
                  onClick={cancelLabelEditor}
                  className='px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200'>
                  Cancel
                </button>
              </div>
            ) : (
              <h3
                onClick={(e) => {
                  e.stopPropagation()
                  openLabelEditor()
                }}
                title='Click to rename group'
                className='font-semibold text-sm text-gray-800 cursor-pointer hover:text-blue-600'>
                {jump.label}
              </h3>
            )}
            <div className='flex items-center gap-1.5'>
              {videoCount > 0 && (
                <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700'>
                  <VideoIcon className='w-3 h-3' />
                  {videoCount}
                </span>
              )}
              {photoCount > 0 && (
                <span className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700'>
                  <PhotoIcon className='w-3 h-3' />
                  {photoCount}
                </span>
              )}
              {croppedCount > 0 && (
                <span
                  data-cropped-count='true'
                  title={`${croppedCount} cropped video${croppedCount > 1 ? 's' : ''}`}
                  className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200'>
                  ✂️ {croppedCount}
                </span>
              )}
            </div>
          </div>
          <div className='flex items-center gap-4 text-xs text-gray-500'>
            {jump.processed === true && (
              <span
                data-processed-badge='true'
                className='px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium'>
                Processed
              </span>
            )}
            <button
              type='button'
              data-action='upload'
              disabled={jump.processed !== true || uploading || locked}
              title={uploadTitle}
              onClick={(e) => {
                e.stopPropagation()
                onUpload(jump.id)
              }}
              className='px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'>
              {isUploadingJump ? (
                <span className='flex items-center gap-1.5'>
                  <svg
                    className='animate-spin w-3 h-3'
                    fill='none'
                    viewBox='0 0 24 24'>
                    <circle
                      className='opacity-25'
                      cx='12'
                      cy='12'
                      r='10'
                      stroke='currentColor'
                      strokeWidth='4'
                    />
                    <path
                      className='opacity-75'
                      fill='currentColor'
                      d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
                    />
                  </svg>
                  Uploading…
                </span>
              ) : (
                'Upload'
              )}
            </button>
            <button
              type='button'
              data-action='process'
              disabled={!canProcess || processing || locked}
              title={locked ? 'Upload in progress – actions locked' : processTitle}
              onClick={(e) => {
                e.stopPropagation()
                onProcess(jump.id)
              }}
              className='px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'>
              {processing ? 'Processing…' : jump.processed === true ? 'Reprocess' : 'Process'}
            </button>
            <span className='tabular-nums font-medium'>
              {formatTime(bounds.start)} — {formatTime(bounds.end)}
            </span>
            <span className='px-2 py-0.5 rounded-full bg-gray-100 text-gray-600'>
              {jump.files.length} files
            </span>
            {importing && (
              <span className='flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium'>
                <svg
                  className='animate-spin w-3 h-3'
                  fill='none'
                  viewBox='0 0 24 24'>
                  <circle
                    className='opacity-25'
                    cx='12'
                    cy='12'
                    r='10'
                    stroke='currentColor'
                    strokeWidth='4'
                  />
                  <path
                    className='opacity-75'
                    fill='currentColor'
                    d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
                  />
                </svg>
                Importing…
              </span>
            )}
          </div>
        </div>
      </div>
      {expanded && (
        <div>
          <div className='px-4 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between'>
            {editingDate ? (
              <>
                <input
                  type='date'
                  value={draftDate}
                  onChange={(e) => setDraftDate(e.target.value)}
                  className='px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white'
                />
                <div className='flex gap-2'>
                  <button
                    type='button'
                    onClick={saveDateEditor}
                    className='px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700'>
                    Done
                  </button>
                  <button
                    type='button'
                    onClick={cancelDateEditor}
                    className='px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200'>
                    Cancel
                  </button>
                </div>
              </>
            ) : editingTime ? (
              <div
                lang='de-CH'
                className='contents'>
                <input
                  type='time'
                  step='1'
                  value={draftTime}
                  onChange={(e) => setDraftTime(e.target.value)}
                  className='px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white'
                />
                <div className='flex gap-2'>
                  <button
                    type='button'
                    onClick={saveTimeEditor}
                    className='px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700'>
                    Done
                  </button>
                  <button
                    type='button'
                    onClick={cancelTimeEditor}
                    className='px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200'>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className='flex items-center gap-3'>
                  <span
                    onClick={openDateEditor}
                    className={`text-sm font-medium ${locked ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:text-blue-600 cursor-pointer'}`}>
                    📅 {jump.day}
                  </span>
                  {jump.files.length > 0 && (
                    <span
                      onClick={openTimeEditor}
                      className={`text-sm font-medium ${locked ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:text-blue-600 cursor-pointer'}`}
                      title='Click to set jump start time'>
                      ⏰ {formatTime(bounds.start)}
                    </span>
                  )}
                </div>
                <button
                  type='button'
                  disabled={locked}
                  onClick={() => onRemoveGroup(jump.id)}
                  className='px-2 py-1 text-xs font-medium text-red-600 hover:text-red-800 bg-red-50 rounded-md hover:bg-red-100 border border-red-200 disabled:opacity-50 disabled:cursor-not-allowed'>
                  Remove Group
                </button>
              </>
            )}
          </div>
          {jump.processed === true && (
            <div
              data-share-section='true'
              className='px-4 py-3 border-b border-gray-100 bg-gray-50/60'>
              {jump.publish?.shareUrl ? (
                <div className='flex items-center gap-2 flex-wrap'>
                  <a
                    href={jump.publish.shareUrl}
                    target='_blank'
                    rel='noreferrer'
                    className='font-mono text-xs text-blue-600 hover:text-blue-800 truncate max-w-[260px]'>
                    {jump.publish.shareUrl}
                  </a>
                  <button
                    type='button'
                    data-action='copy-link'
                    onClick={copyShareLink}
                    className='px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200'>
                    {linkCopied ? 'Copied!' : 'Copy link'}
                  </button>
                </div>
              ) : (
                <p className='text-xs text-gray-500'>Upload to get a share link.</p>
              )}
            </div>
          )}
          {viewMode === 'grid' ? (
            <div className='p-3'>
              <FileGrid
                files={jump.files}
                groupId={jump.id}
                selection={selection[jump.id] ?? {}}
                previewedPath={previewedPath}
                hasSelection={hasSelection}
                onSelect={onSelect}
                onPreview={onPreview}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
              />
            </div>
          ) : (
            <div className='divide-y divide-gray-50'>
              {jump.files.map((file, i) => {
                const isCurrentFile =
                  !!uploadProgress &&
                  uploadProgress.jumpId === jump.id &&
                  uploadProgress.filename === file.filename
                const uploadPercent = isCurrentFile
                  ? uploadProgress.totalBytes > 0
                    ? Math.round((uploadProgress.bytesUploaded / uploadProgress.totalBytes) * 100)
                    : 0
                  : null
                const uploadState = isCurrentFile ? uploadProgress.state : null
                return (
                  <Fragment key={file.path}>
                    {dropIndex === i && (
                      <div
                        data-drop-indicator='true'
                        className='h-0.5 mx-3 rounded bg-blue-500'
                      />
                    )}
                    <FileRow
                      file={file}
                      groupId={jump.id}
                      selected={!!selection[jump.id]?.[file.path]}
                      isPreviewed={previewedPath === file.path}
                      isInMultipleJumps={multiJumpPaths.has(file.path)}
                      hasSelection={locked ? false : hasSelection}
                      uploadPercent={uploadPercent}
                      uploadState={uploadState}
                      onSelect={locked ? () => {} : onSelect}
                      onPreview={locked ? () => {} : onPreview}
                      onDragStart={locked ? undefined : onDragStart}
                      onDragEnd={locked ? undefined : onDragEnd}
                    />
                  </Fragment>
                )
              })}
              {dropIndex === jump.files.length && (
                <div
                  data-drop-indicator='true'
                  className='h-0.5 mx-3 mb-1 rounded bg-blue-500'
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export { JumpCard }
