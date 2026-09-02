import type { Route } from './+types/api.open'
import { exec } from 'node:child_process'

const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData()
  const filePath = String(formData.get('path') ?? '')

  if (!filePath) {
    return { ok: false, error: 'Missing path' }
  }

  try {
    await new Promise<void>((resolve, reject) => {
      exec(`xdg-open "${filePath}"`, {}, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: String(error) }
  }
}

export { action }
