import { ensureNasSession, parentOf } from '@skydock/scripts'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'
import { recordOnStorage } from './storage'

/* The passenger was emailed — or, taken back, was not — and the storage's list is where that is
   said, so that any machine of the club can see it. */
const markEmailed: Intent = async ({ data, manifest, refuse }) => {
  const session = await ensureNasSession()
  if (!session || !data.emailed)
    return refuse('Connect the NAS first — the list of tandems is kept there.')
  const { folder, to, sent } = data.emailed
  let known = true
  const listing = await recordOnStorage(session, parentOf(folder), (index) => {
    const entry = index.tandems.find((t) => t.folder === folder)
    if (!entry) known = false
    else if (sent) entry.emailed = { at: Math.floor(Date.now() / 1000), ...(to ? { to } : {}) }
    else delete entry.emailed
  })
  if (!known) return refuse('This tandem is not on the storage’s list — upload it first.')
  return { ...boardAnswer(manifest), ...listing }
}

export { markEmailed }
