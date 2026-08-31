import { getSystemStatus } from '../lib/status.server'

const loader = async () => {
  const status = getSystemStatus()
  return { ok: true, status }
}

export { loader }
