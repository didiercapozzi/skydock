import {
  clearNasSession,
  dsmCreateFolder,
  dsmListFolder,
  dsmLogin,
  dsmLogout,
  dsmValidateSession,
  ensureNasSession,
  loadNasSession,
  loginWithSession,
  needsCode
} from '@skydock/scripts'
import { z } from 'zod'
import { createValidatedFormAction } from '../../../packages/ui/forms/server'

const actionArgs = z.object({
  intent: z.enum(['status', 'connect', 'disconnect', 'list-folder', 'create-folder']),
  host: z.string().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  /* the 6-digit code of an account with 2-step verification, once the storage has asked for it */
  otp: z.string().optional(),
  path: z.string().optional(),
  name: z.string().optional()
})

const action = createValidatedFormAction()({
  schema: actionArgs,
  handler: async ({ data, errors }) => {
    const notConnected = () => {
      errors.addGlobalError(
        loadNasSession() ? 'Session expired. Please reconnect.' : 'Not connected.'
      )
      return errors.toResponse(401)
    }

    if (data.intent === 'status') {
      const session = await ensureNasSession()
      if (!session) {
        const raw = loadNasSession()
        if (raw && raw.encPasswd) {
          return { connected: false as const, needsRelogin: true as const }
        }
        return { connected: false as const }
      }
      return {
        connected: true as const,
        hostname: session.hostname,
        username: session.username
      }
    }

    if (data.intent === 'connect') {
      if (!data.host || !data.user || !data.password) {
        errors.addGlobalError('Host, username, and password are required.')
        return errors.toResponse(422)
      }
      try {
        await loginWithSession(
          { host: data.host, user: data.user, password: data.password, otp: data.otp || undefined },
          { login: dsmLogin, validate: dsmValidateSession }
        )
        const session = loadNasSession()
        return {
          connected: true as const,
          hostname: session!.hostname,
          username: session!.username
        }
      } catch (err) {
        /* an account with 2-step verification: the dialog asks for the code, and says so plainly
           rather than handing over what the storage said */
        if (needsCode(err))
          errors.addFieldError(
            'otp',
            data.otp
              ? 'That code was not accepted — enter the one your authenticator app shows now.'
              : 'This account uses 2-step verification — enter the 6-digit code from your authenticator app.'
          )
        else errors.addGlobalError(err instanceof Error ? err.message : 'Login failed.')
        return errors.toResponse(422)
      }
    }

    if (data.intent === 'disconnect') {
      const session = loadNasSession()
      if (session) {
        try {
          await dsmLogout(session.hostname, session.sessionId)
        } catch {}
      }
      clearNasSession()
      return { connected: false as const }
    }

    if (data.intent === 'list-folder') {
      const session = await ensureNasSession()
      if (!session) return notConnected()
      try {
        const folderPath = data.path || '/'
        const folders = await dsmListFolder(session.hostname, session.sessionId, folderPath)
        return { folders }
      } catch (err) {
        errors.addGlobalError(err instanceof Error ? err.message : 'Failed to list folder.')
        return errors.toResponse(422)
      }
    }

    if (!data.path || !data.name) {
      errors.addGlobalError('Folder path and name are required.')
      return errors.toResponse(422)
    }
    const session = await ensureNasSession()
    if (!session) return notConnected()
    try {
      await dsmCreateFolder(session.hostname, session.sessionId, data.path, data.name)
      const folders = await dsmListFolder(session.hostname, session.sessionId, data.path)
      return { folders }
    } catch (err) {
      errors.addGlobalError(err instanceof Error ? err.message : 'Failed to create folder.')
      return errors.toResponse(422)
    }
  }
})

export { action, actionArgs }
