import { getOutputDir, readUploadProgress } from '@skydock/scripts'
import type { Route } from './+types/api.upload-progress'

const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url)
  const jumpId = url.searchParams.get('jumpId')

  const accept = request.headers.get('accept') ?? ''
  const wantsEventStream = accept.includes('text/event-stream')

  if (wantsEventStream) {
    let closed = false
    request.signal.addEventListener('abort', () => {
      closed = true
    })

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        const send = (data: unknown) => {
          if (closed) return
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
          } catch {}
        }

        let lastSent = ''
        const tick = () => {
          const state = readUploadProgress(getOutputDir())
          if (state && jumpId && state.jumpId !== jumpId) return
          const json = state ? JSON.stringify(state) : JSON.stringify(null)
          if (json !== lastSent) {
            lastSent = json
            send(state)
          }
          if (state && (state.state === 'done' || state.state === 'error')) {
            setTimeout(() => {
              try {
                controller.close()
              } catch {}
            }, 500)
            closed = true
          }
        }

        tick()
        while (!closed) {
          await new Promise<void>((r) => setTimeout(r, 200))
          if (closed) break
          tick()
          if (closed) break
        }
        try {
          controller.close()
        } catch {}
      },
      cancel() {
        closed = true
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

  const state = readUploadProgress(getOutputDir())
  if (jumpId && state && state.jumpId !== jumpId) {
    return Response.json(null)
  }
  return Response.json(state)
}

export { loader }
