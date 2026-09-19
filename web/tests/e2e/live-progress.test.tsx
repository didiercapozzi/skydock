import { createElement, useState } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'

import type { LiveEvent, ProxyFact } from '@skydock/scripts'
import { FileList } from '../../app/components/file-list'
import type { ManifestFile } from '../../app/components/types'
import { useLiveProgress } from '../../app/hooks/useLiveProgress'

/* A file being processed, or a proxy being made, shows how far along it is on the file itself,
   moving as it goes — heard over the stream the board keeps open, with nothing reloaded and nothing
   asked. The stream is stood in for here; everything it feeds is the real thing. */

const clip = (id: string): ManifestFile => ({
  id,
  path: `/o/${id}.MP4`,
  filename: `${id}.MP4`,
  size: 1,
  mtime: 1_785_000_000
})

/* the stream the board opens, with a way to make the server say something */
let stream: { onmessage: ((message: { data: string }) => void) | null; close: () => void } | null
const says = (event: LiveEvent) => stream?.onmessage?.({ data: JSON.stringify(event) })

beforeEach(() => {
  stream = null
  vi.stubGlobal(
    'EventSource',
    class {
      onmessage: ((message: { data: string }) => void) | null = null
      close = vi.fn()
      constructor() {
        stream = this
      }
    }
  )
})

afterEach(() => vi.unstubAllGlobals())

/* at module scope, as Fast Refresh needs of a component that uses hooks */
const Files = ({ shape }: { shape: 'rows' | 'grid' }) => {
  const [proxies, setProxies] = useState<Record<string, ProxyFact>>({
    '/o/a.MP4': { state: 'none', play: '/o/a.MP4' }
  })
  const [, setTandems] = useState({})
  const [, setNote] = useState<string | null>(null)
  const live = useLiveProgress(setProxies, setTandems, setNote)
  return createElement(FileList, {
    files: [clip('a'), clip('b')],
    kind: 'all',
    shape,
    picked: [],
    statusContext: () => ({}),
    proxies,
    live: live.files,
    onFile: () => {},
    onPick: () => {},
    onOpen: () => {},
    previewed: null,
    offGap: new Set<string>(),
    onDragFile: () => {},
    sortKey: (file: ManifestFile) => file.filename,
    deliveredName: () => null,
    selecting: false
  })
}

const bar = (name: string) => page.getByRole('progressbar', { name })

describe('a file being processed', () => {
  test('shows how far through it is, on the file, and moves as it goes', async () => {
    await render(createElement(Files, { shape: 'rows' }))
    await expect.element(page.getByRole('progressbar')).not.toBeInTheDocument()

    says({ kind: 'file', work: 'process', fileId: 'a', percent: 40 })
    await expect.element(bar('Processing a.MP4')).toHaveAttribute('aria-valuenow', '40')

    says({ kind: 'file', work: 'process', fileId: 'a', percent: 85 })
    await expect.element(bar('Processing a.MP4')).toHaveAttribute('aria-valuenow', '85')
    /* and only on that file */
    expect(page.getByRole('progressbar').elements()).toHaveLength(1)
  })

  test('goes back to saying what the file is once the work ends', async () => {
    await render(createElement(Files, { shape: 'rows' }))
    says({ kind: 'file', work: 'process', fileId: 'a', percent: 40 })
    await expect.element(bar('Processing a.MP4')).toBeInTheDocument()

    says({ kind: 'file-done', work: 'process', fileId: 'a', ok: true })

    await expect.element(page.getByRole('progressbar')).not.toBeInTheDocument()
  })

  test('shows on a thumbnail too', async () => {
    await render(createElement(Files, { shape: 'grid' }))

    says({ kind: 'file', work: 'process', fileId: 'b', percent: 12 })

    await expect.element(bar('Processing b.MP4')).toHaveAttribute('aria-valuenow', '12')
  })
})

describe('a proxy being made', () => {
  test('shows how far through it is, then flags the clip the moment it lands', async () => {
    await render(createElement(Files, { shape: 'rows' }))
    await expect.element(page.getByText('no proxy')).toBeInTheDocument()

    says({ kind: 'file', work: 'proxy', fileId: 'a', percent: 55 })
    await expect.element(bar('Proxy a.MP4')).toHaveAttribute('aria-valuenow', '55')

    says({
      kind: 'file-done',
      work: 'proxy',
      fileId: 'a',
      ok: true,
      proxy: { path: '/o/a.MP4', fact: { state: 'ready', play: '/p/a.mp4' } }
    })

    await expect.element(page.getByRole('progressbar')).not.toBeInTheDocument()
    await expect.element(page.getByText('no proxy')).not.toBeInTheDocument()
  })
})

describe('the board’s line to the machine', () => {
  test('is closed when the board goes away', async () => {
    const screen = await render(createElement(Files, { shape: 'rows' }))
    const opened = stream

    await screen.unmount()

    expect(opened?.close).toHaveBeenCalled()
  })

  test('ignores what it cannot make sense of', async () => {
    await render(createElement(Files, { shape: 'rows' }))

    stream?.onmessage?.({ data: 'not json' })
    stream?.onmessage?.({ data: JSON.stringify({ kind: 'file', percent: 'half' }) })

    await expect.element(page.getByRole('progressbar')).not.toBeInTheDocument()
    await expect.element(page.getByText('a.MP4')).toBeInTheDocument()
  })
})
