import { createElement } from 'react'
import { describe, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { createRoutesStub } from 'react-router'
import { boardRoute } from './board-route'

/* A record that is there and cannot be read is said so on the board (RULES, What lands on disk): the page is
   not the "nothing here yet" of a folder nobody has started, which would offer a scan. */
describe('a board whose record cannot be read', () => {
  test('says so, and tells what to do', async () => {
    const board = {
      groups: [],
      looseFiles: [],
      destinations: [],
      outputs: {},
      proxies: {},
      montages: {},
      remote: null,
      storage: null,
      hasManifest: true,
      unreadable: true,
      processing: null,
      uploading: null,
      nas: { connected: false, hostname: null, username: null }
    }
    const Stub = createRoutesStub([boardRoute(() => board)])
    await render(createElement(Stub, { initialEntries: ['/'] }))

    await expect
      .element(page.getByText(/record could not be read, so nothing is shown from it/))
      .toBeVisible()
  })
})
