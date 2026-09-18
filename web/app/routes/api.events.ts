import { subscribe } from '@skydock/scripts'
import type { Route } from './+types/api.events'

/* What is happening to the files, sent as it happens: one stream the board keeps open, so a file
   being processed or a proxy being made shows how far along it is without anyone asking. Server-sent
   events rather than a socket — everything the board says already goes through its requests, this
   only ever talks one way, and the browser reconnects on its own.

   A comment line goes out every so often so that nothing between here and the page decides an
   idle stream is a dead one. */
const HEARTBEAT_MS = 15_000

const loader = ({ request }: Route.LoaderArgs) => {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start: (controller) => {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text))
        } catch {
          /* the page went away between the event and the write */
        }
      }
      /* said at once: the response only leaves with its first bytes, and a page that hears
         nothing until something happens cannot tell a quiet stream from one that never opened */
      send(': listening\n\n')
      const unsubscribe = subscribe((event) => send(`data: ${JSON.stringify(event)}\n\n`))
      const heartbeat = setInterval(() => send(': still here\n\n'), HEARTBEAT_MS)
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat)
        unsubscribe()
        try {
          controller.close()
        } catch {
          /* closed already */
        }
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
