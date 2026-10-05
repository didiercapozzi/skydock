import type { ProxyFact, StatusContext } from '@skydock/scripts'
import { lockReason } from './file-list'
import { PreviewDrawer } from './preview-drawer'
import type { ManifestFile } from './types'
import { LOOSE, usePreview } from '../hooks/usePreview'
import { fileStatus } from '@skydock/scripts'

const PreviewHost = ({
  preview,
  proxies,
  statusContext,
  onMomentChange,
  onMomentsReset,
  onMomentsRedo,
  onPlayOutside,
  montage
}: {
  preview: ReturnType<typeof usePreview>
  proxies: Record<string, ProxyFact>
  statusContext: (file: ManifestFile) => StatusContext
  onMomentChange: (
    file: ManifestFile,
    which: 'exit' | 'opening' | 'canopy' | 'landing',
    seconds: number
  ) => void
  onMomentsReset: (file: ManifestFile) => void
  onMomentsRedo: (file: ManifestFile) => void
  onPlayOutside: (file: ManifestFile) => void
  montage: boolean
}) => {
  const open = preview.preview
  const shown = open?.files[open.index]
  if (!open || !shown) return null
  return (
    <PreviewDrawer
      windowed={preview.windowed}
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
      onTime={preview.handleVideoTime}
      onCropChange={(crop) => preview.setVideoState({ crop })}
      onApply={preview.handleVideoApply}
      onReset={preview.handleReset}
      onZoomChange={(zoom) => preview.setVideoState({ zoom })}
      onDurationChange={(duration) => preview.setVideoState({ duration })}
      onVideoRef={preview.handleVideoRef}
      rotation={preview.rotation}
      onRotate={preview.handleRotate}
      onRotationApplyToJump={open.groupId === LOOSE ? undefined : preview.handleRotationApplyToJump}
      locked={lockReason(shown, statusContext(shown))}
      onMomentChange={(which, seconds) => onMomentChange(shown, which, seconds)}
      onMomentsReset={() => onMomentsReset(shown)}
      onMomentsRedo={() => onMomentsRedo(shown)}
      onPlayOutside={shown.freed ? undefined : () => onPlayOutside(shown)}
      montage={montage}
    />
  )
}

export { PreviewHost }
