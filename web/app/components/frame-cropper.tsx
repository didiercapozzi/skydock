import { t } from '@lingui/core/macro'
import { containCrop, fitRatio, withRatio } from '@skydock/scripts'
import type { FrameCrop } from '@skydock/scripts'
import { useRef, useState } from 'react'

/* The rectangle that says which part of the picture to keep, drawn straight on top of the video.
   A mount or a finger in the corner of the frame is what this is for: cut it away, and keep the
   shape of what is left so a 16:9 clip is still 16:9 when it is handed over.

   It works in fractions of the frame, never pixels. The video on screen is a 640-wide proxy of a
   4K clip shown at whatever size the drawer happens to be, and the same rectangle has to mean the
   same part of the picture in all three. */

type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'move'

const HANDLES: { corner: Exclude<Handle, 'move'>; style: string }[] = [
  {
    corner: 'nw',
    style: 'top-0 left-0 cursor-nwse-resize -translate-x-1/2 -translate-y-1/2'
  },
  {
    corner: 'ne',
    style: 'top-0 right-0 cursor-nesw-resize translate-x-1/2 -translate-y-1/2'
  },
  {
    corner: 'sw',
    style: 'bottom-0 left-0 cursor-nesw-resize -translate-x-1/2 translate-y-1/2'
  },
  {
    corner: 'se',
    style: 'bottom-0 right-0 cursor-nwse-resize translate-x-1/2 translate-y-1/2'
  }
]

/* Dragging a corner moves the opposite one not at all: that corner is the anchor, and the new
   rectangle is measured from it. With the shape locked, the width is what the pointer decides and
   the height follows — so a corner drag never quietly changes the aspect. */
const resized = (
  crop: FrameCrop,
  corner: Exclude<Handle, 'move'>,
  at: { x: number; y: number },
  ratio: number | null,
  frame: { width: number; height: number }
): FrameCrop => {
  const anchor = {
    x: corner === 'nw' || corner === 'sw' ? crop.x + crop.width : crop.x,
    y: corner === 'nw' || corner === 'ne' ? crop.y + crop.height : crop.y
  }
  const width = Math.abs(at.x - anchor.x)
  const height = Math.abs(at.y - anchor.y)
  const shaped = ratio
    ? withRatio({ ...crop, width, height }, ratio, frame.width, frame.height, 'width')
    : { ...crop, width, height }
  return containCrop({
    ...shaped,
    x: Math.min(anchor.x, at.x) === anchor.x ? anchor.x : anchor.x - shaped.width,
    y: Math.min(anchor.y, at.y) === anchor.y ? anchor.y : anchor.y - shaped.height
  })
}

const FrameCropper = ({
  crop,
  ratio,
  frame,
  onChange
}: {
  crop: FrameCrop
  /* width over height for the shape to hold, or null to drag freely */
  ratio: number | null
  /* the clip's own pixel size, which is what a ratio is measured against */
  frame: { width: number; height: number }
  onChange: (crop: FrameCrop) => void
}) => {
  const box = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<Handle | null>(null)

  /* where the pointer is, as a fraction of the picture rather than of the window */
  const at = (e: React.PointerEvent) => {
    const rect = box.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return null
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    }
  }

  const start = (handle: Handle) => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    /* the pointer is captured so a drag that leaves the video still steers the rectangle, rather
       than stopping wherever the edge happened to be */
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDragging(handle)
  }

  const move = (e: React.PointerEvent) => {
    if (!dragging) return
    const point = at(e)
    if (!point) return
    if (dragging === 'move') {
      onChange(
        containCrop({
          ...crop,
          x: point.x - crop.width / 2,
          y: point.y - crop.height / 2
        })
      )
      return
    }
    onChange(resized(crop, dragging, point, ratio, frame))
  }

  const end = () => setDragging(null)

  return (
    <div
      ref={box}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      className='absolute inset-0 touch-none select-none'>
      {/* what is being cut away, dimmed so the kept part is what the eye lands on */}
      <div className='pointer-events-none absolute inset-0 bg-veil/55' />
      <div
        role='presentation'
        aria-label={t`Part of the picture to keep`}
        onPointerDown={start('move')}
        style={{
          left: `${crop.x * 100}%`,
          top: `${crop.y * 100}%`,
          width: `${crop.width * 100}%`,
          height: `${crop.height * 100}%`
        }}
        className='absolute cursor-move rounded-chip border-2 border-white'>
        {/* the picture shows through here, because the dim layer is behind this one */}
        <div className='absolute inset-0 rounded-bar bg-transparent backdrop-brightness-[1.8]' />
        {HANDLES.map(({ corner, style }) => (
          <span
            key={corner}
            role='presentation'
            aria-label={t`Resize ${corner}`}
            onPointerDown={start(corner)}
            className={`absolute h-2.5 w-2.5 rounded-bar bg-white shadow-ring-stage ${style}`}
          />
        ))}
      </div>
    </div>
  )
}

export { fitRatio, FrameCropper }
