import { z } from 'zod'
import {
  clearNasSession,
  dsmValidateSession,
  loadNasSession,
  saveNasSession
} from '@skydock/scripts'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'

const actionArgs = z.object({
  intent: z.enum(['status', 'connect', 'disconnect']),
  host: z.string().optional(),
  user: z.string().optional(),
  password: z.string().optional()
})

const action = createValidatedFormAction()({
  schema: actionArgs,
  handler: async ({ data, errors }) => {
    if (data.intent === 'status') {
      const session = loadNasSession()
      if (!session) return { connected: false as const }
      const valid = await dsmValidateSession(session.hostname, session.sessionId)
      if (!valid) {
        clearNasSession()
        return { connected: false as const }
      }
      return {
        connected: true as const,
        hostname: session.hostname,
        username: session.username,
        defaultFolder: session.defaultFolder
      }
    }

    if (data.intent === 'connect') {
      if (!data.host || !data.user || !data.password) {
        errors.addGlobalError('Host, username, and password are required.')
        return errors.toResponse(422)
      }
      const { dsmLogin } = await import('@skydock/scripts')
      try {
        const sessionId = await dsmLogin({
          host: data.host,
          user: data.user,
          password: data.password
        })
        saveNasSession({
          hostname: data.host,
          username: data.user,
          sessionId
        })
        return { connected: true as const, hostname: data.host, username: data.user }
      } catch (err) {
        errors.addGlobalError(err instanceof Error ? err.message : 'Login failed.')
        return errors.toResponse(422)
      }
    }

    if (data.intent === 'disconnect') {
      clearNasSession()
      return { connected: false as const }
    }

    errors.addGlobalError('Unknown intent.')
    return errors.toResponse(422)
  }
})

export { action, actionArgs }
