import { useEffect, useRef, useState } from 'react'
import type { ManifestGroup } from './types'
import { VideoCropper } from './video-cropper'
import {
  formatSize,
  formatTime,
  getFileUrl,
  getGroupDate,
  getThumbUrl,
  isVideoFile,
  minFileMtime,
  toDateInputValue,
  toTimeInputValue
} from './utils'

type VideoRef = {
  seek: (time: number) => void
}

const groupMinMtime = (group: ManifestGroup) => minFileMtime(group.files)

const ComparisonDialog = ({
  groups,
  leftGroupId,
  rightGroupId,
  onClose,
  onMerge
}: {
  groups: ManifestGroup[]
  leftGroupId: string
  rightGroupId: string
  onClose: () => void
  onMerge: (leftId: string, rightId: string, anchorEpoch: number) => void
}) => {
  const [currentLeftId, setCurrentLeftId] = useState(leftGroupId)
  const [currentRightId, setCurrentRightId] = useState(rightGroupId)

  const leftGroup = groups.find((j) => j.id === currentLeftId) ?? groups[0]
  const rightGroup = groups.find((j) => j.id === currentRightId) ?? groups[1]

  const leftFileIndexDefault = 0
  const rightFileIndexDefault = 0

  const [leftFileIndex, setLeftFileIndex] = useState(leftFileIndexDefault)
  const [rightFileIndex, setRightFileIndex] = useState(rightFileIndexDefault)

  const [leftDuration, setLeftDuration] = useState(0)
  const [leftCurrentTime, setLeftCurrentTime] = useState(0)
  const [leftZoom, setLeftZoom] = useState(1)
  const leftVideoRefRef = useRef<VideoRef | null>(null)

  const [rightDuration, setRightDuration] = useState(0)
  const [rightCurrentTime, setRightCurrentTime] = useState(0)
  const [rightZoom, setRightZoom] = useState(1)
  const rightVideoRefRef = useRef<VideoRef | null>(null)

  const [showDatePopup, setShowDatePopup] = useState(false)
  const [dateChoice, setDateChoice] = useState<'left' | 'right' | 'custom'>('left')
  const [customDate, setCustomDate] = useState('')
  const [customTime, setCustomTime] = useState('')

  const leftGroupIndex = groups.findIndex((j) => j.id === currentLeftId)
  const rightGroupIndex = groups.findIndex((j) => j.id === currentRightId)

  const navigate = (
    direction: -1 | 1,
    currentId: string,
    currentIdx: number,
    otherSideId: string,
    setSideId: (id: string) => void,
    setFileIndex: (i: number) => void,
    setDuration: (d: number) => void,
    setCurrentTime: (t: number) => void,
    setZoom: (z: number) => void
  ) => {
    const startIdx = currentIdx
    let newIdx = startIdx
    do {
      newIdx = newIdx + direction
      if (newIdx < 0) newIdx = groups.length - 1
      if (newIdx >= groups.length) newIdx = 0
      if (groups[newIdx].id !== otherSideId) {
        setSideId(groups[newIdx].id)
        setFileIndex(0)
        setDuration(0)
        setCurrentTime(0)
        setZoom(1)
        return
      }
    } while (newIdx !== startIdx)
  }

  const handleMergeClick = () => {
    setDateChoice('left')
    setCustomDate(toDateInputValue(groupMinMtime(leftGroup)))
    setCustomTime(toTimeInputValue(groupMinMtime(leftGroup)))
    setShowDatePopup(true)
  }

  const resolveAnchor = () => {
    if (dateChoice === 'left' || dateChoice === 'right') {
      const target = dateChoice === 'left' ? leftGroup : rightGroup
      return groupMinMtime(target)
    }
    if (!customDate) return null
    const parsed = new Date(`${customDate}T${customTime || '00:00'}:00`).getTime()
    if (!Number.isFinite(parsed)) return null
    return Math.round(parsed / 1000)
  }

  const anchor = resolveAnchor()

  const handleMergeConfirm = () => {
    if (anchor === null) return
    setShowDatePopup(false)
    onMerge(currentLeftId, currentRightId, anchor)
  }

  const renderPreview = (
    file: ManifestGroup['files'][number],
    duration: number,
    currentTime: number,
    zoom: number,
    onSeek: (time: number) => void,
    onDurationChange: (duration: number) => void,
    onZoomChange: (zoom: number) => void,
    onVideoRef: (ref: VideoRef) => void
  ) => {
    if (!file) return null
    const fileUrl = getFileUrl(file.path)
    return (
      <div className='flex flex-col gap-2'>
        <div className='bg-gray-950 rounded-lg overflow-hidden flex items-center justify-center h-[200px]'>
          {isVideoFile(file.filename) ? (
            <PreviewVideo
              src={fileUrl}
              onDurationChange={onDurationChange}
              onVideoRef={onVideoRef}
            />
          ) : (
            <img
              src={fileUrl}
              alt={file.filename}
              className='max-h-[200px] max-w-full rounded object-contain'
            />
          )}
        </div>
        {isVideoFile(file.filename) && (
          <VideoCropper
            duration={duration}
            currentTime={currentTime}
            cropStart={null}
            cropEnd={null}
            zoom={zoom}
            readOnly
            thumbSrc={(seek) => getThumbUrl(file.path, seek)}
            onSeek={onSeek}
            onCropChange={() => {}}
            onApply={() => {}}
            onZoomChange={onZoomChange}
          />
        )}
      </div>
    )
  }

  return (
    <div
      data-comparison-dialog='true'
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
      <div className='bg-white rounded-xl shadow-2xl w-[90vw] max-h-[90vh] flex flex-col overflow-hidden'>
        <div className='px-6 py-4 border-b border-gray-200 flex items-center justify-between'>
          <h2 className='text-lg font-semibold text-gray-900'>Compare Groups</h2>
          <button
            type='button'
            onClick={onClose}
            className='text-gray-400 hover:text-gray-600'>
            <svg
              className='w-5 h-5'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'
              strokeWidth={2}>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M6 18L18 6M6 6l12 12'
              />
            </svg>
          </button>
        </div>

        <div className='flex-1 flex overflow-hidden'>
          <ComparePanel
            group={leftGroup}
            groups={groups}
            fileIndex={leftFileIndex}
            onFileIndexChange={setLeftFileIndex}
            duration={leftDuration}
            currentTime={leftCurrentTime}
            zoom={leftZoom}
            onSeek={(t) => {
              setLeftCurrentTime(t)
              leftVideoRefRef.current?.seek(t)
            }}
            onDurationChange={setLeftDuration}
            onZoomChange={setLeftZoom}
            onVideoRef={(ref) => {
              leftVideoRefRef.current = ref
            }}
            onGroupPrev={() =>
              navigate(
                -1,
                currentLeftId,
                leftGroupIndex,
                currentRightId,
                setCurrentLeftId,
                setLeftFileIndex,
                setLeftDuration,
                setLeftCurrentTime,
                setLeftZoom
              )
            }
            onGroupNext={() =>
              navigate(
                1,
                currentLeftId,
                leftGroupIndex,
                currentRightId,
                setCurrentLeftId,
                setLeftFileIndex,
                setLeftDuration,
                setLeftCurrentTime,
                setLeftZoom
              )
            }
            side='left'
            renderPreview={renderPreview}
          />

          <div className='w-px bg-gray-200' />

          <ComparePanel
            group={rightGroup}
            groups={groups}
            fileIndex={rightFileIndex}
            onFileIndexChange={setRightFileIndex}
            duration={rightDuration}
            currentTime={rightCurrentTime}
            zoom={rightZoom}
            onSeek={(t) => {
              setRightCurrentTime(t)
              rightVideoRefRef.current?.seek(t)
            }}
            onDurationChange={setRightDuration}
            onZoomChange={setRightZoom}
            onVideoRef={(ref) => {
              rightVideoRefRef.current = ref
            }}
            onGroupPrev={() =>
              navigate(
                -1,
                currentRightId,
                rightGroupIndex,
                currentLeftId,
                setCurrentRightId,
                setRightFileIndex,
                setRightDuration,
                setRightCurrentTime,
                setRightZoom
              )
            }
            onGroupNext={() =>
              navigate(
                1,
                currentRightId,
                rightGroupIndex,
                currentLeftId,
                setCurrentRightId,
                setRightFileIndex,
                setRightDuration,
                setRightCurrentTime,
                setRightZoom
              )
            }
            side='right'
            renderPreview={renderPreview}
          />
        </div>

        <div className='px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3'>
          <button
            type='button'
            data-action='merge'
            disabled={leftGroup.processed === true || rightGroup.processed === true}
            onClick={handleMergeClick}
            className='px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'>
            Merge
          </button>
          <button
            type='button'
            onClick={onClose}
            className='px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors'>
            Close
          </button>
        </div>
      </div>

      {showDatePopup && (
        <div
          data-merge-date-popup='true'
          className='absolute inset-0 z-10 flex items-center justify-center bg-black/50'>
          <div className='bg-white rounded-xl shadow-2xl w-[380px] p-6'>
            <h3 className='text-base font-semibold text-gray-900 mb-1'>Merge date</h3>
            <p className='text-sm text-gray-500 mb-4'>
              Which date should the merged jump have? The chosen jump keeps its times.
            </p>
            <div className='space-y-2 mb-4'>
              <label className='flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer'>
                <input
                  type='radio'
                  name='merge-date'
                  data-date-choice='left'
                  checked={dateChoice === 'left'}
                  onChange={() => setDateChoice('left')}
                />
                <span className='text-sm text-gray-700'>
                  {leftGroup.label} — {getGroupDate(leftGroup)}
                </span>
              </label>
              <label className='flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer'>
                <input
                  type='radio'
                  name='merge-date'
                  data-date-choice='right'
                  checked={dateChoice === 'right'}
                  onChange={() => setDateChoice('right')}
                />
                <span className='text-sm text-gray-700'>
                  {rightGroup.label} — {getGroupDate(rightGroup)}
                </span>
              </label>
              <label className='flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer'>
                <input
                  type='radio'
                  name='merge-date'
                  data-date-choice='custom'
                  checked={dateChoice === 'custom'}
                  onChange={() => setDateChoice('custom')}
                />
                <span className='text-sm text-gray-700'>Custom</span>
              </label>
              {dateChoice === 'custom' && (
                <div className='flex gap-2 pl-7'>
                  <input
                    type='date'
                    data-custom-date='true'
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className='px-2 py-1.5 text-sm border border-gray-300 rounded-lg'
                  />
                  <input
                    type='time'
                    data-custom-time='true'
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    className='px-2 py-1.5 text-sm border border-gray-300 rounded-lg'
                  />
                </div>
              )}
            </div>
            <div className='flex items-center justify-end gap-3'>
              <button
                type='button'
                data-action='merge-confirm'
                disabled={anchor === null}
                onClick={handleMergeConfirm}
                className='px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'>
                Confirm merge
              </button>
              <button
                type='button'
                data-action='merge-cancel'
                onClick={() => setShowDatePopup(false)}
                className='px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors'>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const ComparePanel = ({
  group,
  groups,
  fileIndex,
  onFileIndexChange,
  duration,
  currentTime,
  zoom,
  onSeek,
  onDurationChange,
  onZoomChange,
  onVideoRef,
  onGroupPrev,
  onGroupNext,
  side,
  renderPreview
}: {
  group: ManifestGroup
  groups: ManifestGroup[]
  fileIndex: number
  onFileIndexChange: (i: number) => void
  duration: number
  currentTime: number
  zoom: number
  onSeek: (time: number) => void
  onDurationChange: (d: number) => void
  onZoomChange: (z: number) => void
  onVideoRef: (ref: VideoRef) => void
  onGroupPrev: () => void
  onGroupNext: () => void
  side: 'left' | 'right'
  renderPreview: (
    file: ManifestGroup['files'][number],
    duration: number,
    currentTime: number,
    zoom: number,
    onSeek: (time: number) => void,
    onDurationChange: (d: number) => void,
    onZoomChange: (z: number) => void,
    onVideoRef: (ref: VideoRef) => void
  ) => React.ReactNode
}) => {
  const file = group.files[fileIndex]
  const groupIndex = groups.findIndex((j) => j.id === group.id)

  return (
    <div
      data-compare-side={side}
      className='flex-1 flex flex-col overflow-hidden min-w-0'>
      <div className='px-4 py-3 bg-gray-50 border-b border-gray-200'>
        <div className='flex items-center justify-between mb-2'>
          <div className='flex items-center gap-2'>
            <button
              type='button'
              data-action={`group-prev-${side}`}
              onClick={onGroupPrev}
              className='w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors'>
              <svg
                className='w-4 h-4'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
                strokeWidth={2}>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  d='M15 19l-7-7 7-7'
                />
              </svg>
            </button>
            <h3 className='font-semibold text-sm text-gray-800 min-w-0 truncate'>{group.label}</h3>
            <button
              type='button'
              data-action={`group-next-${side}`}
              onClick={onGroupNext}
              className='w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors'>
              <svg
                className='w-4 h-4'
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
            </button>
          </div>
          <span className='text-xs text-gray-500 tabular-nums'>
            {groupIndex + 1} / {groups.length}
          </span>
        </div>
        <p className='text-xs text-gray-500'>
          {group.files.length} files • {formatTime(group.files[0]?.mtime ?? 0)} —{' '}
          {formatTime(group.files[group.files.length - 1]?.mtime ?? 0)}
        </p>
      </div>

      <div className='flex-1 overflow-y-auto p-3 space-y-1 min-h-0'>
        {group.files.map((f, i) => (
          <div
            key={f.path}
            data-compare-file='true'
            onClick={() => onFileIndexChange(i)}
            className={`px-3 py-2 rounded-lg cursor-pointer transition-colors ${
              i === fileIndex
                ? 'bg-blue-50 ring-1 ring-blue-400'
                : 'hover:bg-gray-50 border border-transparent hover:border-gray-200'
            }`}>
            <div className='flex items-center justify-between'>
              <span className='font-mono text-xs text-gray-700 truncate'>{f.filename}</span>
              <span className='text-gray-400 text-xs tabular-nums shrink-0 ml-2'>
                {formatSize(f.size)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {file && (
        <div className='shrink-0 border-t border-gray-200 p-3 h-[320px] flex flex-col'>
          <div className='flex-1 min-h-0'>
            {renderPreview(
              file,
              duration,
              currentTime,
              zoom,
              onSeek,
              onDurationChange,
              onZoomChange,
              onVideoRef
            )}
          </div>
          <p className='text-xs text-gray-500 mt-2 shrink-0'>
            File {fileIndex + 1} of {group.files.length}:{' '}
            <span className='font-mono text-gray-700'>{file.filename}</span>
          </p>
        </div>
      )}
    </div>
  )
}

const PreviewVideo = ({
  src,
  onDurationChange,
  onVideoRef
}: {
  src: string
  onDurationChange: (d: number) => void
  onVideoRef: (ref: VideoRef) => void
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (videoRef.current) {
      onVideoRef({
        seek: (time: number) => {
          if (videoRef.current) videoRef.current.currentTime = time
        }
      })
    }
  }, [src, onVideoRef])

  return (
    <video
      ref={videoRef}
      controls
      src={src}
      onLoadedMetadata={(e) => {
        const v = e.currentTarget
        if (v.duration && Number.isFinite(v.duration)) onDurationChange(v.duration)
      }}
      className='max-h-[200px] max-w-full rounded'
    />
  )
}

export { ComparisonDialog }
