import { processingNow, uploadingNow } from '@skydock/scripts'
import { cameraCopying } from '../../../packages/skydock-scripts/src/cameraWatch'

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
