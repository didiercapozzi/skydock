import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import { createRequire } from 'node:module'
import * as os from 'node:os'
import * as path from 'node:path'
import * as url from 'node:url'
import { z } from 'zod'

/* A storage for the journey to talk to: a DSM-like process on 127.0.0.1 that serves a real folder
   (`root`, its shares being the folders in it), so what the app did to it is read off the disk. A
   person types `url` as the host, with the user and password.

   The process is a child, not part of the test: the app reaches it over the network as it would a
   Synology, and `admin` talks to it over a path no DSM has. */

const here = path.dirname(url.fileURLToPath(import.meta.url))
const ENTRY = path.join(here, 'fake-storage-process.ts')
const START_TIMEOUT_MS = 20_000

const linkSchema = z.object({
  id: z.string(),
  url: z.string(),
  path: z.string(),
  name: z.string(),
  status: z.string(),
  link_owner: z.string()
})
type FakeLink = z.infer<typeof linkSchema>

const callSchema = z.object({
  api: z.string(),
  method: z.string(),
  params: z.record(z.string(), z.string())
})
type FakeCall = z.infer<typeof callSchema>

type FakeStorageOptions = {
  user?: string
  password?: string
  /* the shares it holds, as folders of its root */
  shares?: string[]
}

/* the process started, and the port it says it listens on */
const launch = (config: object) =>
  new Promise<{ child: ReturnType<typeof spawn>; port: number }>((resolve, reject) => {
    /* tsx is found from here, so the child needs nothing of the caller's working folder */
    const tsx = url.pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href
    const child = spawn(process.execPath, ['--import', tsx, ENTRY], {
      env: {
        PATH: process.env.PATH,
        TMPDIR: os.tmpdir(),
        FAKE_STORAGE: JSON.stringify(config)
      },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let out = ''
    let err = ''
    const timer = setTimeout(
      () => reject(new Error('The fake storage did not start in time.')),
      START_TIMEOUT_MS
    )
    child.stdout?.on('data', (chunk: Buffer) => {
      out += chunk
      const port = /listening (\d+)/.exec(out)?.[1]
      if (port) {
        clearTimeout(timer)
        resolve({ child, port: Number(port) })
      }
    })
    child.stderr?.on('data', (chunk: Buffer) => (err += chunk))
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`The fake storage stopped (${code}): ${err}`))
    })
  })

const startFakeStorage = async (options: FakeStorageOptions = {}) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'skydock-fake-storage-'))
  const config = {
    root,
    user: options.user ?? 'admin',
    password: options.password ?? 'skydock',
    shares: options.shares ?? ['club']
  }
  const launched = await launch(config).catch(async (error: unknown) => {
    await fs.promises.rm(root, { recursive: true, force: true })
    throw error
  })
  const { child, port } = launched
  const address = `http://127.0.0.1:${port}`

  /* a command to the process, and what it answered */
  const tell = async <T>(name: string, body: object, schema: z.ZodType<T>) => {
    const res = await fetch(`${address}/__fake/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const answer = z.object({ result: schema }).safeParse(await res.json())
    if (!answer.success) throw new Error(`The fake storage did not understand ${name}.`)
    return answer.data.result
  }
  const order = (name: string, body: object = {}) => tell(name, body, z.unknown()).then(() => {})

  const admin = {
    /* an account, or a new password for it: a login with any other is refused with DSM error 400 */
    setPassword: (user: string, password: string) => order('setPassword', { user, password }),
    /* every login now needs this 2-step code, until one with the device token it earned or null */
    requireOtp: (code: string | null) => order('requireOtp', { code }),
    /* every API answer waits this long */
    latency: (ms: number) => order('latency', { ms }),
    /* connections are dropped without an answer, until put back */
    unreachable: (on = true) => order('unreachable', { on }),
    /* an upload of a file whose name matches is refused with this DSM error */
    failUpload: (pattern: string | RegExp, code = 1100) => {
      const re = typeof pattern === 'string' ? new RegExp(pattern) : pattern
      return order('failUpload', { pattern: { source: re.source, flags: re.flags }, code })
    },
    /* the first byte of a stored file changed: same size, same date, other checksum and bytes */
    corrupt: (storagePath: string) => order('corrupt', { path: storagePath }),
    /* every session open now is unknown to the storage: the next call with it is answered 119 */
    sessionExpire: () => order('sessionExpire'),
    /* every share link the storage holds */
    shareLinks: () => tell('shareLinks', {}, z.array(linkSchema)),
    /* a link now shown as not valid (revoked or expired) */
    revokeLink: (id: string, status = 'invalid') => order('revokeLink', { id, status }),
    /* every call the storage received, in order, with its parameters (never a password or code) */
    calls: () => tell('calls', {}, z.array(callSchema)),
    /* the most uploads that were ever being received at the same time */
    peakUploads: () => tell('peakUploads', {}, z.number()),
    /* back to a storage just started: its shares emptied, nothing remembered or logged */
    reset: () => order('reset')
  }

  const stop = async () => {
    const exited = new Promise((resolve) => child.once('exit', resolve))
    child.kill('SIGTERM')
    await exited
    await fs.promises.rm(root, { recursive: true, force: true })
  }

  return { url: address, root, admin, stop }
}

type FakeStorage = Awaited<ReturnType<typeof startFakeStorage>>

export { startFakeStorage }
export type { FakeCall, FakeLink, FakeStorage, FakeStorageOptions }
