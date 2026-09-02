import { execSync } from 'node:child_process'
import { resolveAndValidateFile } from '../lib/path.server'

const loader = async ({ request }: { request: Request }) => {
  const url = new URL(request.url)
  const rawPath = url.searchParams.get('path')
  const id = url.searchParams.get('id')

  const result = resolveAndValidateFile(rawPath, id)
  if ('error' in result) return result.error
  const resolved = result.resolved

  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${resolved}" 2>&1`,
      { encoding: 'utf-8', timeout: 5000 }
    )
    const d = parseFloat(out.trim().split('\n')[0])
    if (Number.isFinite(d) && d > 0)
      return new Response(JSON.stringify({ ok: true, duration: d }), {
        headers: { 'Content-Type': 'application/json' }
      })
  } catch {}

  try {
    const out2 = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=duration -of csv=p=0 "${resolved}" 2>&1`,
      { encoding: 'utf-8', timeout: 5000 }
    )
    const d2 = parseFloat(out2.trim().split('\n')[0])
    if (Number.isFinite(d2) && d2 > 0)
      return new Response(JSON.stringify({ ok: true, duration: d2 }), {
        headers: { 'Content-Type': 'application/json' }
      })
  } catch {}

  return new Response(JSON.stringify({ ok: false, error: 'Could not probe duration' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' }
  })
}

export { loader }
