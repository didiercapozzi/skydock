import { getOutputDir, readUploadProgress } from '@skydock/scripts'
import { z } from 'zod'
import { routingEngine } from '../helpers/routing'
import type { Route } from './+types/api.upload-progress'

const searchParamsArgs = z.object({ scope: z.string().optional() })

const loader = async ({ request }: Route.LoaderArgs) => {
  const { scope } = routingEngine.parseSearchParams(searchParamsArgs, { request })
  const state = readUploadProgress(getOutputDir())
  if (scope && state && state.scope !== scope) return Response.json(null)
  return Response.json(state)
}

export { loader, searchParamsArgs }
