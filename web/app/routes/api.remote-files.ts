import { ensureNasSession, getOutputDir, listRemoteFiles, loadManifest } from '@skydock/scripts'
import type { Route } from './+types/api.remote-files'

const loader = async (_args: Route.LoaderArgs) => {
  const session = await ensureNasSession()
  if (!session) return Response.json({ ok: false as const, reason: 'not-connected' })

  const manifest = loadManifest(`${getOutputDir()}/manifest.json`)
  if (!manifest) return Response.json({ ok: false as const, reason: 'no-manifest' })

  return Response.json({ ok: true as const, ...(await listRemoteFiles(manifest, session)) })
}

export { loader }
