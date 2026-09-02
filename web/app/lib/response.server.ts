const jsonError = (
  message: string,
  status: number,
  extraHeaders: Record<string, string> = {}
): Response =>
  new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  })

const jsonOk = (data: Record<string, unknown> = {}): Response =>
  new Response(JSON.stringify({ ok: true, ...data }), {
    headers: { 'Content-Type': 'application/json' }
  })

export { jsonError, jsonOk }
