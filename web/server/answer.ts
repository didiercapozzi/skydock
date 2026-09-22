import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

/* Writing an answer out, and what to make of one nobody waited for. */

/* A page that let go is not a failure. A clip being watched asks for a stretch of itself and drops
   the rest the moment it has what it needs — a video does that over and over while it plays, and
   again on every seek — and a board closed in the middle of a long answer does the same. The socket
   is gone by then, so there is nobody to tell and nothing to put right. Said as an error, it fills
   the machine's log with alarm about the ordinary. */
const letGo = (e: unknown) => {
  const code = (e as NodeJS.ErrnoException | null)?.code
  return (
    code === 'ERR_STREAM_PREMATURE_CLOSE' ||
    code === 'ERR_STREAM_DESTROYED' ||
    code === 'EPIPE' ||
    code === 'ECONNRESET'
  )
}

/* Sent on as it arrives rather than gathered up first: the board's live stream never ends, so
   waiting for the whole of an answer would mean nothing ever reached the page. Everything written
   to a page goes through here, so a page that let go is answered the same way wherever it happened:
   a clip, a still, or the board's own files. */
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
