import { useEffect, useRef, useState } from 'react'
import type { ManifestJump } from './types'
import { VideoCropper } from './video-cropper'
import { formatSize, formatTime, getFileUrl, isVideoFile } from './utils'

type VideoRef = {
  seek: (time: number) => void
  getBuffered: () => Array<{ start: number; end: number }>
}

const ComparisonDialog = ({
  jumps,
  leftJumpId,
  rightJumpId,
  onClose,
  onMerge
}: {
  jumps: ManifestJump[]
  leftJumpId: string
  rightJumpId: string
  onClose: () => void
  onMerge: () => void
}) => {
  const [currentLeftId, setCurrentLeftId] = useState(leftJumpId)
  const [currentRightId, setCurrentRightId] = useState(rightJumpId)

  const leftJump = jumps.find((j) => j.id === currentLeftId) ?? jumps[0]
  const rightJump = jumps.find((j) => j.id === currentRightId) ?? jumps[1]

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

  const leftJumpIndex = jumps.findIndex((j) => j.id === currentLeftId)
  const rightJumpIndex = jumps.findIndex((j) => j.id === currentRightId)

  const navigateLeft = (direction: -1 | 1) => {
    const startIdx = leftJumpIndex
    let newIdx = startIdx
    do {
      newIdx = newIdx + direction
      if (newIdx < 0) newIdx = jumps.length - 1
      if (newIdx >= jumps.length) newIdx = 0
      if (jumps[newIdx].id !== currentRightId) {
        setCurrentLeftId(jumps[newIdx].id)
        setLeftFileIndex(0)
        setLeftDuration(0)
        setLeftCurrentTime(0)
        setLeftZoom(1)
        return
      }
    } while (newIdx !== startIdx)
  }

  const navigateRight = (direction: -1 | 1) => {
    const startIdx = rightJumpIndex
    let newIdx = startIdx
    do {
      newIdx = newIdx + direction
      if (newIdx < 0) newIdx = jumps.length - 1
      if (newIdx >= jumps.length) newIdx = 0
      if (jumps[newIdx].id !== currentLeftId) {
        setCurrentRightId(jumps[newIdx].id)
        setRightFileIndex(0)
        setRightDuration(0)
        setRightCurrentTime(0)
        setRightZoom(1)
        return
      }
    } while (newIdx !== startIdx)
  }

  const renderPreview = (
    file: ManifestJump['files'][number],
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
            bufferedRanges={[]}
            cropStart={null}
            cropEnd={null}
            zoom={zoom}
            readOnly
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
      <div className='bg-white rounded-xl shadow-2xl w-[960px] max-h-[90vh] flex flex-col overflow-hidden'>
        <div className='px-6 py-4 border-b border-gray-200 flex items-center justify-between'>
          <h2 className='text-lg font-semibold text-gray-900'>Compare Jumps</h2>
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
            jump={leftJump}
            jumps={jumps}
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
            onJumpPrev={() => navigateLeft(-1)}
            onJumpNext={() => navigateLeft(1)}
            side='left'
            renderPreview={renderPreview}
          />

          <div className='w-px bg-gray-200' />

          <ComparePanel
            jump={rightJump}
            jumps={jumps}
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
            onJumpPrev={() => navigateRight(-1)}
            onJumpNext={() => navigateRight(1)}
            side='right'
            renderPreview={renderPreview}
          />
        </div>

        <div className='px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3'>
          <button
            type='button'
            data-action='merge'
            onClick={onMerge}
            className='px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors'>
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
    </div>
  )
}

const ComparePanel = ({
  jump,
  jumps,
  fileIndex,
  onFileIndexChange,
  duration,
  currentTime,
  zoom,
  onSeek,
  onDurationChange,
  onZoomChange,
  onVideoRef,
  onJumpPrev,
  onJumpNext,
  side,
  renderPreview
}: {
  jump: ManifestJump
  jumps: ManifestJump[]
  fileIndex: number
  onFileIndexChange: (i: number) => void
  duration: number
  currentTime: number
  zoom: number
  onSeek: (time: number) => void
  onDurationChange: (d: number) => void
  onZoomChange: (z: number) => void
  onVideoRef: (ref: VideoRef) => void
  onJumpPrev: () => void
  onJumpNext: () => void
  side: 'left' | 'right'
  renderPreview: (
    file: ManifestJump['files'][number],
    duration: number,
    currentTime: number,
    zoom: number,
    onSeek: (time: number) => void,
    onDurationChange: (d: number) => void,
    onZoomChange: (z: number) => void,
    onVideoRef: (ref: VideoRef) => void
  ) => React.ReactNode
}) => {
  const file = jump.files[fileIndex]
  const jumpIndex = jumps.findIndex((j) => j.id === jump.id)

  return (
    <div
      data-compare-side={side}
      className='flex-1 flex flex-col overflow-hidden min-w-0'>
      <div className='px-4 py-3 bg-gray-50 border-b border-gray-200'>
        <div className='flex items-center justify-between mb-2'>
          <div className='flex items-center gap-2'>
            <button
              type='button'
              data-action={`jump-prev-${side}`}
              onClick={onJumpPrev}
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
            <h3 className='font-semibold text-sm text-gray-800 min-w-0 truncate'>{jump.label}</h3>
            <button
              type='button'
              data-action={`jump-next-${side}`}
              onClick={onJumpNext}
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
            {jumpIndex + 1} / {jumps.length}
          </span>
        </div>
        <p className='text-xs text-gray-500'>
          {jump.files.length} files • {formatTime(jump.files[0]?.mtime ?? 0)} —{' '}
          {formatTime(jump.files[jump.files.length - 1]?.mtime ?? 0)}
        </p>
      </div>

      <div className='flex-1 overflow-y-auto p-3 space-y-1 min-h-0'>
        {jump.files.map((f, i) => (
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
            File {fileIndex + 1} of {jump.files.length}:{' '}
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
        },
        getBuffered: () => {
          if (!videoRef.current) return []
          const v = videoRef.current
          const ranges: Array<{ start: number; end: number }> = []
          for (let i = 0; i < v.buffered.length; i++) {
            ranges.push({ start: v.buffered.start(i), end: v.buffered.end(i) })
          }
          return ranges
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
