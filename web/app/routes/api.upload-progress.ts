import { getOutputDir, readUploadProgress } from '@skydock/scripts'
import { z } from 'zod'
import { routingEngine } from '../helpers/routing'
import type { Route } from './+types/api.upload-progress'

const searchParamsArgs = z.object({ groupId: z.string().optional() })

const loader = async ({ request }: Route.LoaderArgs) => {
  const parsed = routingEngine.parseSearchParams(searchParamsArgs, { request })
  const groupId = parsed.groupId

  const state = readUploadProgress(getOutputDir())
  if (groupId && state && state.groupId !== groupId) {
    return Response.json(null)
  }
  return Response.json(state)
}

export { loader, searchParamsArgs }
