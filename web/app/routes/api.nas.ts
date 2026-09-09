import {
  clearNasSession,
  dsmCreateFolder,
  dsmListFolder,
  dsmLogin,
  dsmValidateSession,
  loadNasSession,
  loginWithSession,
  updateDefaultFolder
} from '@skydock/scripts'
import { z } from 'zod'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'

const actionArgs = z.object({
  intent: z.enum([
    'status',
    'connect',
    'disconnect',
    'list-folder',
    'create-folder',
    'select-folder'
  ]),
  host: z.string().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  path: z.string().optional(),
  name: z.string().optional()
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
        await loginWithSession(
          { host: data.host, user: data.user, password: data.password },
          { login: dsmLogin, validate: dsmValidateSession }
        )
        const session = loadNasSession()
        return {
          connected: true as const,
          hostname: session!.hostname,
          username: session!.username,
          defaultFolder: session!.defaultFolder
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

    if (data.intent === 'create-folder') {
      if (!data.path || !data.name) {
        errors.addGlobalError('Folder path and name are required.')
        return errors.toResponse(422)
      }
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
        await dsmCreateFolder(session.hostname, session.sessionId, data.path, data.name)
        const folders = await dsmListFolder(session.hostname, session.sessionId, data.path)
        return { folders }
      } catch (err) {
        errors.addGlobalError(err instanceof Error ? err.message : 'Failed to create folder.')
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
