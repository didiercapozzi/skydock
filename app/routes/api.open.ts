import type { Route } from './+types/api.open'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData()
  const filePath = String(formData.get('path') ?? '')

  if (!filePath) {
    return { ok: false, error: 'Missing path' }
  }

  try {
    await execAsync(`xdg-open "${filePath}"`)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: String(error) }
  }
}

export { action }
