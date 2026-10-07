import { t } from '@lingui/core/macro'
import { isVideoFile } from '@skydock/scripts'
import { useState } from 'react'
import type { CameraFile } from '../../../packages/skydock-scripts/src/cameraEntry'
import { Go, Mini } from './buttons'
import { Modal, Spacer } from './modal'
import { dateLabel, formatSize, hhmm } from './utils'

const IMAGE = /\.(jpe?g|png|webp|gif)$/i

const previewable = (file: CameraFile) => isVideoFile(file.path) || IMAGE.test(file.path)

const urlOf = (file: CameraFile) => `/api/camera-file?path=${encodeURIComponent(file.path)}`

const CameraPreview = ({
  files,
  at,
  onStep,
  onClose,
  onCopy
}: {
  files: CameraFile[]
  at: number
  onStep: (to: number) => void
  onClose: () => void
  onCopy: (file: CameraFile) => void
}) => {
  const file = files[at]
  const [failed, setFailed] = useState<string | null>(null)
  if (!file) return null
  const step = (by: number) => onStep((at + by + files.length) % files.length)
  const when = file.mtime > 0 ? `${dateLabel(file.mtime)} ${hhmm(file.mtime)}` : ''
  const size = formatSize(file.size)
  return (
    <Modal
      label={t`Preview from the camera`}
      title={file.name}
      sub={[when, size].filter(Boolean).join(' · ')}
      wide
      onClose={onClose}
      footer={
        <>
          <Mini
            disabled={files.length < 2}
            onClick={() => step(-1)}>
            {t`Previous`}
          </Mini>
          <Mini
            disabled={files.length < 2}
            onClick={() => step(1)}>
            {t`Next`}
          </Mini>
          <Spacer />
          {file.state === 'missing' && <Go onClick={() => onCopy(file)}>{t`Copy this file`}</Go>}
        </>
      }>
      <div
        tabIndex={0}
        role='group'
        aria-label={t`The file`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') step(1)
          else if (e.key === 'ArrowLeft') step(-1)
        }}
        className='flex min-h-80 items-center justify-center rounded-corner bg-black outline-none'>
        {failed === file.path ? (
          <p className='m-0 max-w-105 p-6 text-center text-body text-white/80'>
            {t`This file cannot be played here. Copy it to look at it with the board's own player.`}
          </p>
        ) : isVideoFile(file.path) ? (
          <video
            key={file.path}
            src={urlOf(file)}
            controls
            autoPlay
            onError={() => setFailed(file.path)}
            className='max-h-[60vh] w-full'
          />
        ) : (
          <img
            key={file.path}
            src={urlOf(file)}
            alt={file.name}
            onError={() => setFailed(file.path)}
            className='max-h-[60vh] max-w-full object-contain'
          />
        )}
      </div>
    </Modal>
  )
}

export { CameraPreview, previewable }
