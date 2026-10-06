import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import { createRequire } from 'node:module'
import * as os from 'node:os'
import * as path from 'node:path'
import * as url from 'node:url'
import { z } from 'zod'

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
  shares?: string[]
}

const launch = (config: object) =>
  new Promise<{ child: ReturnType<typeof spawn>; port: number }>((resolve, reject) => {
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
    setPassword: (user: string, password: string) => order('setPassword', { user, password }),
    requireOtp: (code: string | null) => order('requireOtp', { code }),
    latency: (ms: number) => order('latency', { ms }),
    unreachable: (on = true) => order('unreachable', { on }),
    failUpload: (pattern: string | RegExp, code = 1100) => {
      const re = typeof pattern === 'string' ? new RegExp(pattern) : pattern
      return order('failUpload', { pattern: { source: re.source, flags: re.flags }, code })
    },
    corrupt: (storagePath: string) => order('corrupt', { path: storagePath }),
    sessionExpire: () => order('sessionExpire'),
    shareLinks: () => tell('shareLinks', {}, z.array(linkSchema)),
    revokeLink: (id: string, status = 'invalid') => order('revokeLink', { id, status }),
    calls: () => tell('calls', {}, z.array(callSchema)),
    peakUploads: () => tell('peakUploads', {}, z.number()),
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
