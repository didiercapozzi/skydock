import { getOutputDir, subscribe, watchBoard, watchMontages } from '@skydock/scripts'
import { watchCameras } from '../../../packages/skydock-scripts/src/cameraWatch'
import { watchDisk } from '../../../packages/skydock-scripts/src/diskSpace'
import { watchServerHolds } from '../../../packages/skydock-scripts/src/lib/lag'
import { clearStaleIncoming } from '../../../packages/skydock-scripts/src/importFile'
import { resumeMoments } from '../../../packages/skydock-scripts/src/momentPass'
import { resumeProxies } from '../../../packages/skydock-scripts/src/proxy'
import type { Route } from './+types/api.events'

const HEARTBEAT_MS = 15_000

const loader = ({ request }: Route.LoaderArgs) => {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start: (controller) => {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text))
        } catch {}
      }
      send(': listening\n\n')
      const unsubscribe = subscribe((event) => send(`data: ${JSON.stringify(event)}\n\n`))
      void watchCameras(getOutputDir())
      clearStaleIncoming(getOutputDir())
      resumeProxies(getOutputDir())
      resumeMoments(getOutputDir())
      watchDisk(getOutputDir())
      watchServerHolds()
      const stopWatching = watchMontages(getOutputDir())
      const stopWatchingBoard = watchBoard(getOutputDir())
      const heartbeat = setInterval(() => send(': still here\n\n'), HEARTBEAT_MS)
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        stopWatching()
        stopWatchingBoard()
        unsubscribe()
        try {
          controller.close()
        } catch {}
      })
    }
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    }
  })
}

export { loader }
