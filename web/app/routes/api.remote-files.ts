import { ensureNasSession, getOutputDir, listRemoteFiles, loadManifest } from '@skydock/scripts'
import type { Route } from './+types/api.remote-files'

/* Re-checks what the NAS holds, for the Refresh button and after an upload. Read-only: it never
   writes the manifest, because an upload record is proof of what travelled and only the upload
   path may write one — a listing may demote a file, never promote it (§14.5). */
const loader = async (_args: Route.LoaderArgs) => {
  const session = await ensureNasSession()
  if (!session) return Response.json({ ok: false as const, reason: 'not-connected' })

  const manifest = loadManifest(`${getOutputDir()}/manifest.json`)
  if (!manifest) return Response.json({ ok: false as const, reason: 'no-manifest' })

  return Response.json({ ok: true as const, ...(await listRemoteFiles(manifest, session)) })
}

export { loader }
