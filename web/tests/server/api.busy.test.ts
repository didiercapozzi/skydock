// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { job } from '@skydock/scripts'
import { loader } from '../../app/routes/api.busy'

beforeEach(() => {
  globalThis.skydockLive = undefined
})

describe('what stopping SkyDock would cost', () => {
  it('is nothing to say while nothing is running', async () => {
    expect(await loader().json()).toEqual({ running: null, ifStopped: [] })
  })

  it('says, while an upload is running, that the files already sent stay and the one being sent is sent again', async () => {
    job({ type: 'upload', label: 'Luc Favre', total: 3 })
    const said = (await loader().json()) as { running: string; ifStopped: string[] }
    expect(said.running).toContain('An upload is running')
    expect(said.ifStopped.join(' ')).toMatch(/already sent stay.*sent again/)
  })

  it('says, while a film is being rendered, that it has to be rendered again', async () => {
    job({ type: 'render', label: 'Luc Favre', total: 1 })
    const said = (await loader().json()) as { ifStopped: string[] }
    expect(said.ifStopped.join(' ')).toMatch(/rendered again/)
  })
})
