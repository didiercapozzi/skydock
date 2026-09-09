import {
  clearNasSession,
  dsmListFolder,
  dsmLogin,
  dsmValidateSession,
  loadNasSession,
  saveNasSession,
  updateDefaultFolder
} from '@skydock/scripts'
import { z } from 'zod'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'

const actionArgs = z.object({
  intent: z.enum(['status', 'connect', 'disconnect', 'list-folder', 'select-folder']),
  host: z.string().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  path: z.string().optional()
})

const action = createValidatedFormAction()({
  schema: actionArgs,
  handler: async ({ data, errors }) => {
    if (data.intent === 'status') {
      const session = loadNasSession()
      if (!session) return { connected: false as const }
      const valid = await dsmValidateSession(session.hostname, session.sessionId)
      if (!valid) {
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
      try {
        const prev = loadNasSession()
        const prevFolder =
          prev?.hostname === data.host && prev?.username === data.user
            ? prev.defaultFolder
            : undefined
        const sessionId = await dsmLogin({
          host: data.host,
          user: data.user,
          password: data.password
        })
        console.log('[api.nas] connect save', {
          host: data.host,
          user: data.user,
          sessionId: sessionId.slice(0, 8) + '...',
          prevFolder
        })
        saveNasSession({
          hostname: data.host,
          username: data.user,
          sessionId,
          defaultFolder: prevFolder
        })
        console.log('[api.nas] after save', loadNasSession())
        return {
          connected: true as const,
          hostname: data.host,
          username: data.user,
          defaultFolder: prevFolder
        }
      } catch (err) {
        errors.addGlobalError(err instanceof Error ? err.message : 'Login failed.')
        return errors.toResponse(422)
      }
    }

    if (data.intent === 'disconnect') {
      clearNasSession()
      return { connected: false as const }
    }

    if (data.intent === 'list-folder') {
      const session = loadNasSession()
      if (!session) {
        errors.addGlobalError('Not connected.')
        return errors.toResponse(401)
      }
      const valid = await dsmValidateSession(session.hostname, session.sessionId)
      if (!valid) {
        errors.addGlobalError('Session expired. Please reconnect.')
        return errors.toResponse(401)
      }
      try {
        const folderPath = data.path || '/'
        const folders = await dsmListFolder(session.hostname, session.sessionId, folderPath)
        return { folders }
      } catch (err) {
        errors.addGlobalError(err instanceof Error ? err.message : 'Failed to list folder.')
        return errors.toResponse(422)
      }
    }

    if (data.intent === 'select-folder') {
      if (!data.path) {
        errors.addGlobalError('Folder path required.')
        return errors.toResponse(422)
      }
      const session = loadNasSession()
      if (!session) {
        errors.addGlobalError('Not connected.')
        return errors.toResponse(401)
      }
      updateDefaultFolder(data.path)
      const updated = loadNasSession()
      return { connected: true as const, defaultFolder: updated?.defaultFolder ?? data.path }
    }

    errors.addGlobalError('Unknown intent.')
    return errors.toResponse(422)
  }
})

export { action, actionArgs }
