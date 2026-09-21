import type { ProxyFact, StatusContext } from '@skydock/scripts'
import { lockReason } from './file-list'
import { PreviewDrawer } from './preview-drawer'
import type { ManifestFile } from './types'
import { LOOSE, usePreview } from '../hooks/usePreview'
import { fileStatus } from '@skydock/scripts'

/* the preview drawer, wired to what the preview hook holds about the file being looked at */
const PreviewHost = ({
  preview,
  proxies,
  statusContext,
  onMomentChange
}: {
  preview: ReturnType<typeof usePreview>
  proxies: Record<string, ProxyFact>
  statusContext: (file: ManifestFile) => StatusContext
  /* a mark on the timeline, corrected: where the jump is belongs to the file, so it is saved at once
     rather than waiting for a Save that trims something */
  onMomentChange: (
    file: ManifestFile,
    which: 'exit' | 'canopy' | 'landing',
    seconds: number
  ) => void
}) => {
  const open = preview.preview
  const shown = open?.files[open.index]
  if (!open || !shown) return null
  return (
    <PreviewDrawer
      files={open.files}
      index={open.index}
      status={fileStatus(shown, statusContext(shown))}
      proxy={proxies[shown.path]}
      frame={preview.frame}
      onFrameChange={preview.handleFrameChange}
      onFrameApplyToJump={open.groupId === LOOSE ? undefined : preview.handleFrameApplyToJump}
      onClose={preview.closePreview}
      onPrevious={() => preview.stepPreview(-1)}
      onNext={() => preview.stepPreview(1)}
      cropStart={preview.videoState.crop.cropStart}
      cropEnd={preview.videoState.crop.cropEnd}
      zoom={preview.videoState.zoom}
      currentTime={preview.videoState.currentTime}
      duration={preview.videoState.duration}
      onSeek={preview.handleVideoSeek}
      onCropChange={(crop) => preview.setVideoState({ crop })}
      onApply={preview.handleVideoApply}
      onZoomChange={(zoom) => preview.setVideoState({ zoom })}
      onDurationChange={(duration) => preview.setVideoState({ duration })}
      onVideoRef={preview.handleVideoRef}
      rotation={preview.rotation}
      onRotate={preview.handleRotate}
      onRotationApplyToJump={open.groupId === LOOSE ? undefined : preview.handleRotationApplyToJump}
      locked={lockReason(shown, statusContext(shown))}
      onMomentChange={(which, seconds) => onMomentChange(shown, which, seconds)}
    />
  )
}

export { PreviewHost }
