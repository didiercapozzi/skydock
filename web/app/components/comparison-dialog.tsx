import { useEffect, useRef, useState } from 'react'
import type { ManifestGroup } from './types'
import { VideoCropper } from './video-cropper'
import {
  formatSize,
  formatTime,
  getPlaybackUrl,
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
    const fileUrl = getPlaybackUrl(file)
    return (
      <div className='flex flex-col gap-2'>
        <div className='flex h-[200px] items-center justify-center overflow-hidden rounded-lg bg-[#0b0f13]'>
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
      className='fixed inset-0 z-40 grid place-items-center bg-[rgba(8,12,16,0.5)] p-4'>
      <div className='flex max-h-[90vh] w-[90vw] flex-col overflow-hidden rounded-xl border border-line bg-pane text-ink shadow-[0_20px_60px_rgba(0,0,0,0.35)]'>
        <div className='flex items-center justify-between border-b border-line px-4 py-[13px]'>
          <h2 className='m-0 text-[14px] font-semibold'>Compare Groups</h2>
          <button
            type='button'
            onClick={onClose}
            className='text-ink-3 hover:text-ink'>
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

          <div className='w-px bg-line' />

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

        <div className='flex items-center justify-end gap-2 border-t border-line px-4 py-[11px]'>
          <button
            type='button'
            data-action='merge'
            disabled={leftGroup.processed === true || rightGroup.processed === true}
            onClick={handleMergeClick}
            className='rounded-[5px] border border-accent bg-accent px-3 py-1 text-[12px] font-semibold text-white hover:brightness-110 disabled:cursor-default disabled:opacity-45'>
            Merge
          </button>
          <button
            type='button'
            onClick={onClose}
            className='rounded-[5px] border border-line bg-pane px-2 py-[3px] text-[11.5px] text-ink-2 hover:border-ink-3 hover:text-ink'>
            Close
          </button>
        </div>
      </div>

      {showDatePopup && (
        <div
          data-merge-date-popup='true'
          className='absolute inset-0 z-10 grid place-items-center bg-[rgba(8,12,16,0.5)] p-4'>
          <div className='w-[380px] rounded-xl border border-line bg-pane p-4 text-ink shadow-[0_20px_60px_rgba(0,0,0,0.35)]'>
            <h3 className='mb-1 text-[14px] font-semibold'>Merge date</h3>
            <p className='mb-3.5 text-[12.5px] text-ink-2'>
              Which date should the merged jump have? The chosen jump keeps its times.
            </p>
            <div className='space-y-2 mb-4'>
              <label className='flex cursor-pointer flex-row items-center gap-2 rounded-lg border border-line px-3 py-2 hover:bg-line-2'>
                <input
                  type='radio'
                  name='merge-date'
                  data-date-choice='left'
                  checked={dateChoice === 'left'}
                  onChange={() => setDateChoice('left')}
                />
                <span className='text-[12.5px] text-ink'>
                  {leftGroup.label} — {getGroupDate(leftGroup)}
                </span>
              </label>
              <label className='flex cursor-pointer flex-row items-center gap-2 rounded-lg border border-line px-3 py-2 hover:bg-line-2'>
                <input
                  type='radio'
                  name='merge-date'
                  data-date-choice='right'
                  checked={dateChoice === 'right'}
                  onChange={() => setDateChoice('right')}
                />
                <span className='text-[12.5px] text-ink'>
                  {rightGroup.label} — {getGroupDate(rightGroup)}
                </span>
              </label>
              <label className='flex cursor-pointer flex-row items-center gap-2 rounded-lg border border-line px-3 py-2 hover:bg-line-2'>
                <input
                  type='radio'
                  name='merge-date'
                  data-date-choice='custom'
                  checked={dateChoice === 'custom'}
                  onChange={() => setDateChoice('custom')}
                />
                <span className='text-[12.5px] text-ink'>Custom</span>
              </label>
              {dateChoice === 'custom' && (
                <div className='flex gap-2 pl-7'>
                  <input
                    type='date'
                    data-custom-date='true'
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className='rounded-md border border-line bg-ground px-[9px] py-1.5 text-[13px] text-ink'
                  />
                  <input
                    type='time'
                    data-custom-time='true'
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    className='rounded-md border border-line bg-ground px-[9px] py-1.5 text-[13px] text-ink'
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
                className='rounded-[5px] border border-accent bg-accent px-3 py-1 text-[12px] font-semibold text-white hover:brightness-110 disabled:cursor-default disabled:opacity-45'>
                Confirm merge
              </button>
              <button
                type='button'
                data-action='merge-cancel'
                onClick={() => setShowDatePopup(false)}
                className='rounded-[5px] border border-line bg-pane px-2 py-[3px] text-[11.5px] text-ink-2 hover:border-ink-3 hover:text-ink'>
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
      <div className='border-b border-line bg-ground px-3 py-2.5'>
        <div className='flex items-center justify-between mb-2'>
          <div className='flex items-center gap-2'>
            <button
              type='button'
              data-action={`group-prev-${side}`}
              onClick={onGroupPrev}
              className='flex h-6 w-6 items-center justify-center rounded text-ink-2 hover:bg-line-2 hover:text-ink'>
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
            <h3 className='min-w-0 truncate text-[13px] font-semibold'>{group.label}</h3>
            <button
              type='button'
              data-action={`group-next-${side}`}
              onClick={onGroupNext}
              className='flex h-6 w-6 items-center justify-center rounded text-ink-2 hover:bg-line-2 hover:text-ink'>
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
          <span className='font-mono text-[11px] text-ink-3 tabular-nums'>
            {groupIndex + 1} / {groups.length}
          </span>
        </div>
        <p className='text-[12px] text-ink-2'>
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
                ? 'border border-pick bg-pick-soft'
                : 'border border-transparent hover:bg-line-2'
            }`}>
            <div className='flex items-center justify-between'>
              <span className='truncate font-mono text-[11.5px]'>{f.filename}</span>
              <span className='ml-2 shrink-0 font-mono text-[11px] text-ink-3 tabular-nums'>
                {formatSize(f.size)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {file && (
        <div className='flex h-[320px] shrink-0 flex-col border-t border-line p-3'>
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
          <p className='mt-2 shrink-0 text-[12px] text-ink-2'>
            File {fileIndex + 1} of {group.files.length}:{' '}
            <span className='font-mono text-ink'>{file.filename}</span>
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
