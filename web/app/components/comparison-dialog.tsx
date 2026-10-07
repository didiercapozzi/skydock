import { plural, t } from '@lingui/core/macro'
import { useEffect, useRef, useState } from 'react'
import { Go, Mini } from './buttons'
import { Icon } from './icons'
import { INPUT, Modal, Spacer } from './modal'
import type { VideoRef } from './preview-drawer'
import type { ManifestGroup } from './types'
import { VideoCropper } from './video-cropper'
import {
  dateLabel,
  formatSize,
  getPlaybackUrl,
  getGroupDate,
  getThumbUrl,
  hhmm,
  isVideoFile,
  minFileMtime,
  toDateInputValue,
  toTimeInputValue
} from './utils'

const groupMinMtime = (group: ManifestGroup) => minFileMtime(group.files)

/* When something was shot, said in full and to the minute. Two cameras are compared here because
   one of their clocks is wrong, so the day matters as much as the hour — and the second never did:
   nobody sets a clock by it, and it is only ever noise between two times being read side by side. */
const fullWhen = (epoch: number) => `${dateLabel(epoch)} ${hhmm(epoch)}`

/* the run of a jump: the day and minute it starts, and where it ends — with the day again only if
   it ran into the next one */
const runOf = (files: ManifestGroup['files']) => {
  const first = files[0]?.mtime ?? 0
  const last = files[files.length - 1]?.mtime ?? 0
  const sameDay = dateLabel(first) === dateLabel(last)
  return `${fullWhen(first)} — ${sameDay ? hhmm(last) : fullWhen(last)}`
}

const ComparisonDialog = ({
  groups,
  labels,
  leftGroupId,
  rightGroupId,
  onClose,
  onMerge
}: {
  groups: ManifestGroup[]
  /* what each jump is called on the board — its place among the jumps, or its montage's name */
  labels: Map<string, string>
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

  /* Ready for the keyboard from the moment it opens, as every other list on the board is: the file
     the left side is on takes the focus, so the arrows have somewhere to move from without anything
     being clicked first. */
  useEffect(() => {
    document
      .querySelector<HTMLElement>('[data-compare-side="left"] [data-compare-file][tabindex="0"]')
      ?.focus()
  }, [])

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
        <div className='flex h-50 items-center justify-center overflow-hidden rounded-corner bg-stage'>
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
              className='max-h-50 max-w-full rounded-corner object-contain'
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
            thumbSrc={(seek) => getThumbUrl(file.proxy ?? file.path, seek)}
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
    <Modal
      data-comparison-dialog='true'
      label={t`Compare jumps`}
      title={t`Compare jumps`}
      full
      onClose={onClose}
      footer={
        <>
          <Spacer />
          <Mini onClick={onClose}>{t`Close`}</Mini>
          <Go
            disabled={leftGroup.processed === true || rightGroup.processed === true}
            onClick={handleMergeClick}>
            {t`Merge`}
          </Go>
        </>
      }>
      <div className='flex-1 flex overflow-hidden'>
        <ComparePanel
          group={leftGroup}
          label={labels.get(leftGroup.id) ?? leftGroup.label}
          groups={groups}
          fileIndex={leftFileIndex}
          onFileIndexChange={setLeftFileIndex}
          duration={leftDuration}
          currentTime={leftCurrentTime}
          zoom={leftZoom}
          onSeek={(time) => {
            setLeftCurrentTime(time)
            leftVideoRefRef.current?.seek(time)
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
          label={labels.get(rightGroup.id) ?? rightGroup.label}
          groups={groups}
          fileIndex={rightFileIndex}
          onFileIndexChange={setRightFileIndex}
          duration={rightDuration}
          currentTime={rightCurrentTime}
          zoom={rightZoom}
          onSeek={(time) => {
            setRightCurrentTime(time)
            rightVideoRefRef.current?.seek(time)
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

      {showDatePopup && (
        <div
          data-merge-date-popup='true'
          className='fixed inset-0 z-50 grid place-items-center bg-scrim p-4 '>
          {/* drawn as every dialog is — a plain header and a footer on a tinted well — while staying
              inside the comparison, whose keys it shares */}
          <div className='flex w-95 flex-col overflow-hidden rounded-corner bg-pane text-ink shadow-float'>
            <h3 className='font-display m-0 border-b border-line-2 px-6.5 pt-5 pb-4 text-heading leading-title font-bold tracking-display'>
              {t`Merge date`}
            </h3>
            <div className='px-6.5 pt-5'>
              <p className='mb-3.5 text-body text-ink-2'>
                {t`Which date should the merged jump have? The chosen jump keeps its times.`}
              </p>
              <div className='space-y-2 mb-4'>
                <label className='flex cursor-pointer flex-row items-center gap-2 rounded-corner border border-line-2 px-3 py-2 hover:bg-well has-checked:border-accent has-checked:bg-accent-soft'>
                  <input
                    type='radio'
                    name='merge-date'
                    data-date-choice='left'
                    checked={dateChoice === 'left'}
                    onChange={() => setDateChoice('left')}
                  />
                  <span className='text-body text-ink'>
                    {labels.get(leftGroup.id) ?? leftGroup.label} — {getGroupDate(leftGroup)}
                  </span>
                </label>
                <label className='flex cursor-pointer flex-row items-center gap-2 rounded-corner border border-line-2 px-3 py-2 hover:bg-well has-checked:border-accent has-checked:bg-accent-soft'>
                  <input
                    type='radio'
                    name='merge-date'
                    data-date-choice='right'
                    checked={dateChoice === 'right'}
                    onChange={() => setDateChoice('right')}
                  />
                  <span className='text-body text-ink'>
                    {labels.get(rightGroup.id) ?? rightGroup.label} — {getGroupDate(rightGroup)}
                  </span>
                </label>
                <label className='flex cursor-pointer flex-row items-center gap-2 rounded-corner border border-line-2 px-3 py-2 hover:bg-well has-checked:border-accent has-checked:bg-accent-soft'>
                  <input
                    type='radio'
                    name='merge-date'
                    data-date-choice='custom'
                    checked={dateChoice === 'custom'}
                    onChange={() => setDateChoice('custom')}
                  />
                  <span className='text-body text-ink'>{t`Custom`}</span>
                </label>
                {dateChoice === 'custom' && (
                  <div className='flex gap-2 pl-7'>
                    <input
                      type='date'
                      data-custom-date='true'
                      value={customDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      className={INPUT}
                    />
                    <input
                      type='time'
                      data-custom-time='true'
                      value={customTime}
                      onChange={(e) => setCustomTime(e.target.value)}
                      className={INPUT}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className='flex items-center justify-end gap-3 bg-well px-6.5 py-3.5'>
              <Mini onClick={() => setShowDatePopup(false)}>{t`Cancel`}</Mini>
              <Go
                disabled={anchor === null}
                onClick={handleMergeConfirm}>
                {t`Confirm merge`}
              </Go>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

const ComparePanel = ({
  group,
  label,
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
  label: string
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
  const list = useRef<HTMLDivElement | null>(null)
  /* named, so a translator reads what each one is */
  const jump = label
  const fileCount = group.files.length
  const run = runOf(group.files)
  const position = fileIndex + 1

  const rowsIn = () => [
    ...(list.current?.querySelectorAll<HTMLElement>('[data-compare-file]') ?? [])
  ]

  const focusRow = (e: React.KeyboardEvent, to: number) => {
    e.preventDefault()
    const rows = rowsIn()
    const row = rows[Math.max(0, Math.min(rows.length - 1, to))]
    row?.focus()
    row?.scrollIntoView({ block: 'nearest' })
  }

  /* the jump under these keys changes, and with it every row: the first of the new one is where the
     keyboard goes, or it would be left on a row that is no longer there */
  const toAnotherJump = (e: React.KeyboardEvent, go: () => void) => {
    e.preventDefault()
    go()
    requestAnimationFrame(() => rowsIn()[0]?.focus())
  }

  return (
    <div
      data-compare-side={side}
      className='flex-1 flex flex-col overflow-hidden min-w-0'>
      <div className='border-b border-line-2 bg-well px-3 py-2.5'>
        <div className='flex items-center justify-between mb-2'>
          <div className='flex items-center gap-2'>
            <button
              type='button'
              data-action={`group-prev-${side}`}
              onClick={onGroupPrev}
              className='grid h-7 w-7 place-items-center rounded-corner border border-line-strong bg-pane text-ink-2 hover:bg-well hover:text-ink'>
              <Icon
                name='previous'
                size={15}
              />
            </button>
            <h3 className='min-w-0 truncate text-body font-semibold'>{label}</h3>
            <button
              type='button'
              data-action={`group-next-${side}`}
              onClick={onGroupNext}
              className='grid h-7 w-7 place-items-center rounded-corner border border-line-strong bg-pane text-ink-2 hover:bg-well hover:text-ink'>
              <Icon
                name='next'
                size={15}
              />
            </button>
          </div>
          <span className='font-mono text-micro text-ink-3 tabular-nums'>
            {groupIndex + 1} / {groups.length}
          </span>
        </div>
        <p className='text-small text-ink-2'>
          {plural(fileCount, { one: `# file • ${run}`, other: `# files • ${run}` })}
        </p>
      </div>

      {/* The files of this jump, worked through the way every other list on the board is: the arrows
          move along it, Enter takes the one they are on, and left and right go to the next jump on
          this side. Moving and taking are two things here rather than one, as they are nowhere else:
          taking a file loads a clip, and walking past six of them would load six. */}
      <div
        role='listbox'
        aria-label={t`Files of ${jump}`}
        ref={list}
        onKeyDown={(e) => {
          const rows = rowsIn()
          const at = rows.indexOf(document.activeElement as HTMLElement)
          if (e.key === 'ArrowDown') focusRow(e, at + 1)
          else if (e.key === 'ArrowUp') focusRow(e, at - 1)
          else if (e.key === 'Home') focusRow(e, 0)
          else if (e.key === 'End') focusRow(e, rows.length - 1)
          else if (e.key === 'ArrowLeft') toAnotherJump(e, onGroupPrev)
          else if (e.key === 'ArrowRight') toAnotherJump(e, onGroupNext)
        }}
        className='flex-1 overflow-y-auto p-2 space-y-px min-h-0'>
        {group.files.map((f, i) => (
          <div
            key={f.path}
            data-compare-file='true'
            role='option'
            aria-selected={i === fileIndex}
            /* only the one taken is tabbed to, so Tab goes from one side to the other rather than
               through every clip of this one */
            tabIndex={i === fileIndex ? 0 : -1}
            onClick={() => onFileIndexChange(i)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault()
              onFileIndexChange(i)
            }}
            className={`px-3 py-2 rounded-corner cursor-pointer transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
              i === fileIndex ? 'bg-accent-soft shadow-inset-bar' : 'hover:bg-well'
            }`}>
            <div className='flex items-center justify-between'>
              <span className='truncate font-mono text-micro'>{f.filename}</span>
              <span className='ml-2 shrink-0 font-mono text-micro text-ink-3 tabular-nums'>
                {formatSize(f.size)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {file && (
        <div className='flex h-80 shrink-0 flex-col border-t border-line-2 px-4 py-3'>
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
          <p className='mt-2 shrink-0 text-small text-ink-2'>
            {t`File ${position} of ${fileCount}:`}{' '}
            <span className='font-mono text-ink'>{file.filename}</span>
            {' · '}
            <span className='text-ink'>{fullWhen(file.mtime)}</span>
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
  return (
    <video
      /* the way to seek this element is handed up as soon as it exists */
      ref={(el) =>
        onVideoRef({
          seek: (time: number) => {
            if (el) el.currentTime = time
          }
        })
      }
      controls
      src={src}
      onLoadedMetadata={(e) => {
        const v = e.currentTarget
        if (v.duration && Number.isFinite(v.duration)) onDurationChange(v.duration)
      }}
      className='max-h-50 max-w-full rounded-corner'
    />
  )
}

export { ComparisonDialog }
