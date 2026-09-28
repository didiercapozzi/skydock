import { processingNow, uploadingNow } from '@skydock/scripts'
import { cameraCopying } from '../../../packages/skydock-scripts/src/cameraWatch'

/* What is being written right now, for the window to ask before it closes: quitting in the middle of
   an upload, processing or a camera being copied cuts it off (RULES, Where SkyDock runs). None is null. */
const loader = () => {
  const running = uploadingNow()
    ? 'An upload is running'
    : processingNow()
      ? 'Something is being processed'
      : cameraCopying()
        ? 'A camera is being copied'
        : null
  return Response.json({ running })
}

export { loader }
