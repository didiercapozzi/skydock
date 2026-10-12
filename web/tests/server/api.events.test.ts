// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { publish } from '@skydock/scripts'
import { loader } from '../../app/routes/api.events'
import { routeArgs } from './fixtures'

const open = () => {
  const abort = new AbortController()
  const response = loader(
    routeArgs(new Request('http://localhost/api/events', { signal: abort.signal }))
  )
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  const next = async (): Promise<string> => {
    const text = decoder.decode((await reader.read()).value)
    return text.startsWith(':') || text.includes('"kind":"disk"') ? next() : text
  }
  return { response, next, reader, close: () => abort.abort() }
}

beforeEach(() => {
  globalThis.skydockLive = undefined
})

describe('what is happening to the files, sent as it happens', () => {
  it('opens at once, before anything has happened', async () => {
    const { reader, close } = open()
    expect(new TextDecoder().decode((await reader.read()).value)).toBe(': listening\n\n')
    close()
  })

  it('sends each thing as it happens, one event each', async () => {
    const { next, close } = open()

    publish({ kind: 'file', work: 'process', fileId: 'a', percent: 40 })

    expect(await next()).toBe(
      `data: ${JSON.stringify({ kind: 'file', work: 'process', fileId: 'a', percent: 40 })}\n\n`
    )
    close()
  })

  it('starts with what is already under way', async () => {
    publish({ kind: 'file', work: 'proxy', fileId: 'running', percent: 60 })

    const { next, close } = open()

    expect(await next()).toContain('"fileId":"running","percent":60')
    close()
  })

  it('ends when the page goes away', async () => {
    const { reader, close } = open()

    await reader.read()
    close()

    let read = await reader.read()
    while (!read.done) read = await reader.read()
    expect(read.done).toBe(true)
  })
})
