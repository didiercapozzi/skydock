import { getOutputDir, readUploadProgress } from '@skydock/scripts'
import { z } from 'zod'
import { routingEngine } from '../helpers/routing'
import type { Route } from './+types/api.upload-progress'

const searchParamsArgs = z.object({ jumpId: z.string().optional() })

const loader = async ({ request }: Route.LoaderArgs) => {
  const parsed = routingEngine.parseSearchParams(searchParamsArgs, { request })
  const jumpId = parsed.jumpId

  const state = readUploadProgress(getOutputDir())
  if (jumpId && state && state.jumpId !== jumpId) {
    return Response.json(null)
  }
  return Response.json(state)
}

export { loader, searchParamsArgs }
