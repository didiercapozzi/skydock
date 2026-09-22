// @vitest-environment node
import * as http from 'node:http'
import { describe, it, expect, afterEach } from 'vitest'
import { letGo, sendAnswer } from '../../server/answer'

/* An answer is written out as it arrives, because the board's live stream never ends. What is being
   written is often let go of before it is finished: a clip being watched asks for a stretch of
   itself and drops the rest the moment it has enough, over and over while it plays. The socket is
   gone by then — there is nobody to tell and nothing to put right, so it is not a failure and is
   never said out loud. Said out loud, it was two lines of alarm every time a preview was opened. */

let running: http.Server | null = null

afterEach(async () => {
  const server = running
  running = null
  if (server) await new Promise((done) => server.close(() => done(null)))
})

/* a server that hands out an endless answer, and says how the writing of it ended */
const serving = async () => {
  const ended: { value: unknown }[] = []
  const server = http.createServer((_req, res) => {
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(64 * 1024))
      }
    })
    void sendAnswer(new Response(endless, { headers: { 'Content-Type': 'video/mp4' } }), res).then(
      () => ended.push({ value: 'written' }),
      (e: unknown) => ended.push({ value: e })
    )
  })
  running = server
  await new Promise((up) => server.listen(0, '127.0.0.1', () => up(null)))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return { ended, port }
}

describe('an answer the page lets go of', () => {
  it('is finished with, not failed', async () => {
    const { ended, port } = await serving()

    /* what a video does: it takes what it needs of a clip and drops the rest */
    await new Promise((done) => {
      const request = http.get({ host: '127.0.0.1', port, path: '/api/file/clip.mp4' }, (res) => {
        res.once('data', () => {
          request.destroy()
          done(null)
        })
      })
    })

    await expect.poll(() => ended.length).toBe(1)
    expect(ended[0]?.value).toBe('written')
  })
})

describe('what counts as a page letting go', () => {
  const because = (code: string) => letGo(Object.assign(new Error('nope'), { code }))

  it('is a write that ended before what it was writing did', () => {
    expect(because('ERR_STREAM_PREMATURE_CLOSE')).toBe(true)
    expect(because('ERR_STREAM_DESTROYED')).toBe(true)
  })

  it('is a connection the other end closed or broke', () => {
    expect(because('EPIPE')).toBe(true)
    expect(because('ECONNRESET')).toBe(true)
  })

  it('is not anything else, which is still worth saying out loud', () => {
    expect(because('ENOENT')).toBe(false)
    expect(letGo(new Error('the disk is full'))).toBe(false)
    expect(letGo(null)).toBe(false)
  })
})
