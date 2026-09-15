import { dayToIso, isoToDay } from '@skydock/scripts'
import { Fragment, useEffect, useRef, useState } from 'react'
import type { UploadProgressState } from '../hooks/useUploadProgress'
import { FileGrid } from './file-grid'
import { FileRow } from './file-row'
import { PhotoIcon, VideoIcon } from './icons'
import type { Destination, ManifestFile, ManifestGroup, SelectionMap } from './types'
import { formatTime, getGroupBounds, isVideoFile } from './utils'

const GroupCard = ({
  group,
  selection,
  multiGroupPaths,
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
  importing,
  onCreateMontage,
  hasKdenlive,
  destinations,
  onDestinationChange
}: {
  group: ManifestGroup
  selection: SelectionMap
  multiGroupPaths: Set<string>
  previewedPath: string | null
  dropIndex: number | null
  onSelect: (groupId: string, path: string, ctrl: boolean, shift: boolean) => void
  onPreview: (file: ManifestFile, groupId: string) => void
  onDragStart?: (e: React.DragEvent, groupId: string, paths: string[]) => void
  onDragEnd?: () => void
  onDrop?: (e: React.DragEvent, targetGroupId: string) => void
  onDragOver?: (e: React.DragEvent, targetGroupId: string) => void
  onDragLeave?: (groupId: string) => void
  onLabelChange: (groupId: string, label: string) => void
  onProcess: (groupId: string) => void
  processing: boolean
  onUpload: (groupId: string) => void
  uploading: boolean
  nasConnected: boolean
  hasUploadFolder: boolean
  viewMode: 'list' | 'grid'
  hasSelection: boolean
  onRemoveGroup: (groupId: string) => void
  onGroupDateChange: (groupId: string, day: string) => void
  onGroupTimeChange: (groupId: string, anchorEpoch: number) => void
  uploadProgress?: UploadProgressState | null
  onImportFile?: (groupId: string, files: File[]) => void
  importing?: boolean
  onCreateMontage?: (groupId: string) => void
  hasKdenlive?: boolean
  destinations?: Destination[]
  onDestinationChange?: (groupId: string, destinationName: string) => void
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
  const bounds = getGroupBounds(group)
  const videoCount = group.files.filter((f) => isVideoFile(f.filename)).length
  const photoCount = group.files.length - videoCount
  const croppedCount = group.files.filter(
    (f) => isVideoFile(f.filename) && (f.cropStart != null || f.cropEnd != null)
  ).length
  const canProcess = group.files.length > 0
  const processTitle = group.files.length === 0 ? 'Empty group' : undefined
  const uploadTitle =
    group.processed !== true
      ? 'Process the group first'
      : !nasConnected
        ? 'Connect to NAS to upload'
        : !hasUploadFolder
          ? 'Choose an upload folder first'
          : undefined
  const locked = uploading || (!!uploadProgress && uploadProgress.groupId === group.id)
  const isUploadingGroup = locked
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
      if (files.length > 0) onImportFileRef.current?.(group.id, files)
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
  }, [group.id])

  const openLabelEditor = () => {
    if (locked) return
    setDraftLabel(group.label)
    setEditingLabel(true)
  }

  const saveLabelEditor = () => {
    const trimmed = draftLabel.trim()
    if (trimmed && trimmed !== group.label) onLabelChange(group.id, trimmed)
    setEditingLabel(false)
  }

  const cancelLabelEditor = () => {
    setEditingLabel(false)
  }

  const openDateEditor = () => {
    if (locked) return
    setDraftDate(dayToIso(group.day))
    setEditingDate(true)
  }

  const saveDateEditor = () => {
    if (!draftDate) return
    try {
      const deCh = isoToDay(draftDate)
      onGroupDateChange(group.id, deCh)
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
    onGroupTimeChange(group.id, anchorEpoch)
    setEditingTime(false)
  }

  const cancelTimeEditor = () => {
    setEditingTime(false)
  }

  const copyShareLink = async () => {
    if (!group.publish?.shareUrl) return
    try {
      await navigator.clipboard.writeText(group.publish.shareUrl)
      setLinkCopied(true)
    } catch {
      setLinkCopied(false)
    }
  }

  return (
    <div
      ref={cardRef}
      data-group-card='true'
      onDragOver={(e) => {
        if (locked) return
        e.preventDefault()
        onDragOver?.(e, group.id)
      }}
      onDrop={(e) => {
        if (locked) return
        e.preventDefault()
        onDrop?.(e, group.id)
      }}
      onDragLeave={() => {
        if (locked) return
        onDragLeave?.(group.id)
      }}
      className={`relative border rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden ${
        osDragOver ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-200'
      } ${locked ? 'opacity-80 pointer-events-none' : ''}`}>
      {osDragOver && (
        <div className='absolute inset-0 z-20 flex items-center justify-center bg-blue-50/80 rounded-xl pointer-events-none'>
          <span className='text-sm font-medium text-blue-700'>
            {group.processed === true ? 'Drop to import' : 'Drop to add to group'}
          </span>
        </div>
      )}
      <div
        data-group-card-toggle='true'
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
                {group.label}
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
            {group.processed === true && (
              <span
                data-processed-badge='true'
                className='px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium'>
                Processed
              </span>
            )}
            <button
              type='button'
              data-action='upload'
              disabled={group.processed !== true || uploading || locked}
              title={uploadTitle}
              onClick={(e) => {
                e.stopPropagation()
                onUpload(group.id)
              }}
              className='px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'>
              {isUploadingGroup ? (
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
            {group.processed === true && onCreateMontage && (
              <button
                type='button'
                data-action='create-montage'
                disabled={locked || hasKdenlive}
                title={hasKdenlive ? 'Montage already created' : 'Create montage project'}
                onClick={(e) => {
                  e.stopPropagation()
                  onCreateMontage(group.id)
                }}
                className='px-3 py-1 text-xs font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed'>
                {hasKdenlive ? 'Montage Created' : 'Create Montage'}
              </button>
            )}
            <button
              type='button'
              data-action='process'
              disabled={!canProcess || processing || locked}
              title={locked ? 'Upload in progress – actions locked' : processTitle}
              onClick={(e) => {
                e.stopPropagation()
                onProcess(group.id)
              }}
              className='px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'>
              {processing ? 'Processing…' : group.processed === true ? 'Reprocess' : 'Process'}
            </button>
            <span className='tabular-nums font-medium'>
              {formatTime(bounds.start)} — {formatTime(bounds.end)}
            </span>
            <span className='px-2 py-0.5 rounded-full bg-gray-100 text-gray-600'>
              {group.files.length} files
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
                    📅 {group.day}
                  </span>
                  {group.files.length > 0 && (
                    <span
                      onClick={openTimeEditor}
                      className={`text-sm font-medium ${locked ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:text-blue-600 cursor-pointer'}`}
                      title='Click to set group start time'>
                      ⏰ {formatTime(bounds.start)}
                    </span>
                  )}
                </div>
                <button
                  type='button'
                  disabled={locked}
                  onClick={() => onRemoveGroup(group.id)}
                  className='px-2 py-1 text-xs font-medium text-red-600 hover:text-red-800 bg-red-50 rounded-md hover:bg-red-100 border border-red-200 disabled:opacity-50 disabled:cursor-not-allowed'>
                  Remove Group
                </button>
              </>
            )}
          </div>
          {group.processed === true && (
            <div
              data-share-section='true'
              className='px-4 py-3 border-b border-gray-100 bg-gray-50/60'>
              {group.publish?.shareUrl ? (
                <div className='flex items-center gap-2 flex-wrap'>
                  <a
                    href={group.publish.shareUrl}
                    target='_blank'
                    rel='noreferrer'
                    className='font-mono text-xs text-blue-600 hover:text-blue-800 truncate max-w-[260px]'>
                    {group.publish.shareUrl}
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
          {destinations && destinations.length > 0 && onDestinationChange && (
            <div className='px-4 py-2 border-b border-gray-100 bg-gray-50/60'>
              <div className='flex items-center gap-2'>
                <span className='text-xs font-medium text-gray-500'>Destination:</span>
                <select
                  value={group.destination ?? ''}
                  onChange={(e) => onDestinationChange(group.id, e.target.value)}
                  className='px-2 py-1 text-xs border border-gray-300 rounded-md bg-white focus:ring-1 focus:ring-blue-500'>
                  <option value=''>None</option>
                  {destinations.map((dest) => (
                    <option
                      key={dest.name}
                      value={dest.name}>
                      {dest.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {viewMode === 'grid' ? (
            <div className='p-3'>
              <FileGrid
                files={group.files}
                groupId={group.id}
                selection={selection[group.id] ?? {}}
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
              {group.files.map((file, i) => {
                const isCurrentFile =
                  !!uploadProgress &&
                  uploadProgress.groupId === group.id &&
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
                      groupId={group.id}
                      selected={!!selection[group.id]?.[file.path]}
                      isPreviewed={previewedPath === file.path}
                      isInMultipleGroups={multiGroupPaths.has(file.path)}
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
              {dropIndex === group.files.length && (
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

export { GroupCard }
