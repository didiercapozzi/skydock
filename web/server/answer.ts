import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const letGo = (e: unknown) => {
  const code = (e as NodeJS.ErrnoException | null)?.code
  return (
    code === 'ERR_STREAM_PREMATURE_CLOSE' ||
    code === 'ERR_STREAM_DESTROYED' ||
    code === 'EPIPE' ||
    code === 'ECONNRESET'
  )
}

const writeOut = async (from: NodeJS.ReadableStream, res: NodeJS.WritableStream) =>
  await pipeline(from, res).catch((e: unknown) => {
    if (!letGo(e)) throw e
  })

const sendAnswer = async (
  answer: Response,
  res: NodeJS.WritableStream & { writeHead: WriteHead }
) => {
  const headers: Record<string, string | string[]> = {}
  for (const [name, value] of answer.headers) if (name !== 'set-cookie') headers[name] = value
  const cookies = answer.headers.getSetCookie()
  if (cookies.length > 0) headers['set-cookie'] = cookies
  res.writeHead(answer.status, headers)
  if (!answer.body) {
    res.end()
    return
  }
  await writeOut(Readable.fromWeb(answer.body as never), res)
}

type WriteHead = (status: number, headers: Record<string, string | string[]>) => unknown

export { letGo, sendAnswer, writeOut }
