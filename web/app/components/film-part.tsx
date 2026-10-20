import { i18n } from '@lingui/core'
import { t } from '@lingui/core/macro'
import { isQuarterTurn, speedOf, turnBy, turnedSize } from '@skydock/scripts/client'
import type { EditClip, EditSource } from '@skydock/scripts/client'
import type { FrameCrop, Rotation } from '@skydock/scripts'
import { useRef, useState } from 'react'
import { clockOf, SHORTEST } from '../helpers/filmTimeline'
import { Go, Mini, Seg } from './buttons'
import { fitRatio, FrameCropper } from './frame-cropper'
import { Modal } from './modal'
import { pictureStyle, RATIOS, savedShape } from './preview-drawer'
import type { RatioOption } from './preview-drawer'
import { getFileUrl, getThumbUrl } from './utils'
import { VideoCropper } from './video-cropper'

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

const STAGE_REM = 24

type Placed = {
  start: number
  end: number
  speed: number
  frame: FrameCrop | null
  rotation: Rotation
}

const choice = (on: boolean) =>
  `flex h-10 items-center justify-center rounded-corner px-3 text-small font-medium ${
    on ? 'bg-accent-soft text-accent-ink' : 'bg-well text-ink hover:bg-line'
  }`

const SpeedSelect = ({ value, onChange }: { value: number; onChange: (speed: number) => void }) => (
  <select
    aria-label={t`Speed`}
    value={value}
    onChange={(e) => onChange(Number(e.target.value))}
    className='h-7 rounded-corner border border-line-strong bg-pane px-1.5 text-small text-ink-2'>
    {SPEEDS.map((one) => (
      <option
        key={one}
        value={one}>
        {one === 1 ? t`Normal` : `${one}×`}
      </option>
    ))}
  </select>
)

const FilmPart = ({
  clip,
  source,
  onPlace,
  onRemove,
  onClose
}: {
  clip: EditClip
  source: EditSource
  onPlace: (placed: Placed) => void
  onRemove: () => void
  onClose: () => void
}) => {
  const [part, setPart] = useState({ start: clip.start, end: clip.end })
  const [speed, setSpeed] = useState(speedOf(clip))
  const [at, setAt] = useState(clip.start)
  const [zoom, setZoom] = useState(1)
  const [tab, setTab] = useState<'cut' | 'frame' | 'turn'>('cut')
  const [rotation, setRotation] = useState<Rotation>(clip.rotation ?? 0)
  const [frame, setFrame] = useState<FrameCrop | null>(clip.frame ?? null)
  const [shape, setShape] = useState({ width: 16, height: 9 })
  const [picked, setPicked] = useState<{ label: string; ratio: number | null } | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const moments = Object.fromEntries(source.marks.map((mark) => [mark.which, mark.at]))
  const lasts = clockOf((part.end - part.start) / speed)

  const turned = turnedSize(shape.width, shape.height, rotation)
  const own = savedShape(frame, turned)
  const shown = picked?.label ?? own.label
  const ratio = picked ? picked.ratio : own.ratio
  const framing = frame !== null && shown !== 'None'

  const seek = (seconds: number) => {
    setAt(seconds)
    if (video.current) video.current.currentTime = seconds
  }

  const pickRatio = (option: RatioOption) => {
    if (option.label === 'None') {
      setPicked({ label: 'None', ratio: null })
      setFrame(null)
      return
    }
    const next = option.label === 'Free' ? null : (option.ratio ?? turned.width / turned.height)
    setPicked({ label: option.label, ratio: next })
    setFrame(
      next === null
        ? (frame ?? fitRatio(turned.width / turned.height, turned.width, turned.height))
        : fitRatio(next, turned.width, turned.height)
    )
  }

  const turn = (by: number) => {
    const next = turnBy(rotation, by)
    if (frame && isQuarterTurn(next) !== isQuarterTurn(rotation)) {
      const after = turnedSize(shape.width, shape.height, next)
      const keep = shown === 'Same' || ratio === null ? after.width / after.height : ratio
      if (shown === 'Same') setPicked({ label: 'Same', ratio: keep })
      setFrame(fitRatio(keep, after.width, after.height))
    }
    setRotation(next)
  }

  const place = () => {
    if (part.end - part.start < SHORTEST) return
    onPlace({
      start: part.start,
      end: part.end,
      speed,
      frame: framing ? frame : null,
      rotation
    })
  }

  return (
    <Modal
      label={t`Choose the part of ${clip.name}`}
      title={t`Choose the part`}
      sub={t`Drag the ends of the part over what the film shows, or press Start here and End here while it plays.`}
      full={880}
      onClose={onClose}
      footer={
        <>
          <Mini onClick={onRemove}>{t`Remove the clip`}</Mini>
          <span className='flex-1' />
          <Mini onClick={onClose}>{t`Cancel`}</Mini>
          <Go
            disabled={part.end - part.start < SHORTEST}
            onClick={place}>
            {t`Use this part`}
          </Go>
        </>
      }>
      <div className='flex min-h-0 flex-col gap-4 overflow-auto p-5'>
        <div
          style={{
            aspectRatio: `${turned.width} / ${turned.height}`,
            width: `min(100%, ${STAGE_REM * (turned.width / turned.height)}rem)`
          }}
          className='relative mx-auto shrink-0 overflow-hidden rounded-corner bg-stage'>
          <video
            ref={video}
            src={getFileUrl(source.play)}
            controls
            playsInline
            preload='auto'
            onLoadedMetadata={(e) => {
              const v = e.currentTarget
              if (v.videoWidth && v.videoHeight)
                setShape({ width: v.videoWidth, height: v.videoHeight })
              seek(part.start)
            }}
            onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)}
            style={pictureStyle(shape, rotation)}
            className='absolute top-1/2 left-1/2 max-h-none max-w-none rounded-corner'
          />
          {framing && frame && (
            <FrameCropper
              crop={frame}
              ratio={ratio}
              frame={turned}
              onChange={setFrame}
            />
          )}
        </div>
        <Seg
          label={t`What to change`}
          wide
          value={tab}
          options={[
            ['cut', t`Cut`],
            ['frame', t`Frame`],
            ['turn', t`Turn`]
          ]}
          onPick={setTab}
        />
        {tab === 'cut' && (
          <>
            <VideoCropper
              duration={source.seconds}
              currentTime={at}
              cropStart={part.start}
              cropEnd={part.end}
              zoom={zoom}
              moments={moments}
              thumbSrc={(seconds) => getThumbUrl(source.play, seconds, 160)}
              onSeek={seek}
              onCropChange={({ cropStart, cropEnd }) =>
                setPart({ start: cropStart ?? 0, end: cropEnd ?? source.seconds })
              }
              onApply={({ cropStart, cropEnd }) =>
                cropStart === null && cropEnd === null
                  ? setPart({ start: 0, end: source.seconds })
                  : place()
              }
              onZoomChange={setZoom}
            />
            <div className='flex flex-wrap items-center gap-3 text-body text-ink-2'>
              <label className='flex items-center gap-2'>
                {t`Speed`}
                <SpeedSelect
                  value={speed}
                  onChange={setSpeed}
                />
              </label>
              <span className='tabular-nums'>
                {clockOf(part.start)} – {clockOf(part.end)} · {t`lasts ${lasts}`}
              </span>
            </div>
          </>
        )}
        {tab === 'frame' && (
          <span
            role='group'
            aria-label={t`Frame`}
            className='flex flex-wrap gap-2'>
            {RATIOS.map((option) => (
              <button
                key={option.label}
                type='button'
                aria-pressed={shown === option.label}
                title={i18n._(option.title)}
                onClick={() => pickRatio(option)}
                className={choice(shown === option.label)}>
                {option.name ? i18n._(option.name) : option.label}
              </button>
            ))}
          </span>
        )}
        {tab === 'turn' && (
          <span
            role='group'
            aria-label={t`Turn`}
            className='flex flex-wrap gap-2'>
            {(
              [
                [
                  '0°',
                  t`Back to as shot`,
                  rotation === 0,
                  () => rotation !== 0 && turn(360 - rotation)
                ],
                ['↻ +90°', t`Turn a quarter clockwise`, rotation === 90, () => turn(90)],
                ['↻ +180°', t`Turn upside down`, rotation === 180, () => turn(180)]
              ] as const
            ).map(([label, title, on, go]) => (
              <button
                key={label}
                type='button'
                aria-label={label}
                aria-pressed={on}
                title={title}
                onClick={go}
                className={choice(on)}>
                {label}
              </button>
            ))}
          </span>
        )}
      </div>
    </Modal>
  )
}

export { FilmPart, SpeedSelect }
export type { Placed }
