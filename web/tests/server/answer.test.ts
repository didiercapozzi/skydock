// @vitest-environment node
import * as http from 'node:http'
import { describe, it, expect, afterEach } from 'vitest'
import { sendAnswer } from '../../server/answer'

let running: http.Server | null = null

afterEach(async () => {
  const server = running
  running = null
  if (server) await new Promise((done) => server.close(() => done(null)))
})

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

describe('a video the page stops watching', () => {
  it('ends quietly', async () => {
    const { ended, port } = await serving()

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
