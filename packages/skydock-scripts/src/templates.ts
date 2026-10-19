import * as crypto from 'node:crypto'
import { createReadStream } from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import { copyFile, mkdir, open, rename, rm, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import { Unzip, UnzipInflate } from 'fflate'
import { inJob } from './live'
import { openToHost, pathExists, walkFiles } from './lib/fs'
import { availableTemplates, defaultTemplate, DEFAULT_MARK, inspectTemplate } from './montage'
import { relinkTemplate } from './templateLinks'
import type { TemplateFact } from './templateEntry'
import { run } from './tools'

const setDefaultTemplate = async (outputDir: string, name: string | null) => {
  const root = path.join(outputDir, 'templates')
  const mark = path.join(root, DEFAULT_MARK)
  if (name === null) {
    await rm(mark, { force: true })
    return listTemplates(outputDir)
  }
  if (!(await availableTemplates(outputDir)).some((t) => t.name === name))
    throw new Error(`There is no template called ${name}.`)
  await mkdir(root, { recursive: true })
  await writeFile(mark, `${name}\n`)
  return listTemplates(outputDir)
}

const listTemplates = async (outputDir: string) => {
  const byDefault = await defaultTemplate(outputDir)
  const templates = await Promise.all(
    (await availableTemplates(outputDir)).map(async (template): Promise<TemplateFact> => {
      const fact = { name: template.name, byDefault: template.name === byDefault }
      try {
        const { version, assets, missing } = await inspectTemplate(template.path)
        return { ...fact, version, assets: assets.length, missing }
      } catch {
        return { ...fact, version: null, assets: 0, missing: [] }
      }
    })
  )
  return { templates }
}

const folderNameOf = (raw: string) =>
  raw
    .replace(/\.(kdenlive|zip|tgz|tar\.gz|tar)$/i, '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/^\.+/, '')
    .trim()

const escapes = (entry: string) =>
  path.isAbsolute(entry) || entry.split(/[\\/]/).includes('..') || entry.includes('\0')

const unzipInto = async (archive: string, dir: string) => {
  const failures: string[] = []
  let queue: Promise<void> = Promise.resolve()
  const enqueue = (step: () => Promise<void>) => {
    queue = queue.then(step).catch((e: Error) => {
      failures.push(e.message)
    })
  }
  const unzip = new Unzip()
  unzip.register(UnzipInflate)
  unzip.onfile = (file) => {
    if (escapes(file.name)) {
      failures.push(`${file.name} would land outside the template's folder`)
      return
    }
    if (file.name.endsWith('/')) return
    const target = path.join(dir, file.name)
    let handle: FileHandle | undefined
    enqueue(async () => {
      await mkdir(path.dirname(target), { recursive: true })
      handle = await open(target, 'w')
    })
    file.ondata = (error, chunk, final) => {
      if (error) failures.push(`${file.name}: ${error.message}`)
      enqueue(async () => {
        try {
          if (!error) await handle?.write(chunk)
        } finally {
          if (error || final) await handle?.close()
        }
      })
    }
    file.start()
  }
  for await (const chunk of createReadStream(archive)) {
    unzip.push(chunk, false)
    await queue
  }
  unzip.push(new Uint8Array(0), true)
  await queue
  if (failures.length > 0) throw new Error(failures[0])
}

const untarInto = async (archive: string, dir: string) => {
  const listed = await run('tar', ['-tf', archive])
  if (!listed.ok) throw new Error('The archive cannot be read as a tar archive.')
  const bad = listed.stdout.split('\n').find((entry) => entry && escapes(entry))
  if (bad) throw new Error(`${bad} would land outside the template's folder`)
  const unpacked = await run('tar', ['-xf', archive, '-C', dir, '--no-same-owner'])
  if (!unpacked.ok) throw new Error('The archive could not be unpacked.')
}

type Arriving = { filename: string; at: string }

const wayDown = (filename: string) =>
  filename.split(/[\\/]/).filter((part) => part !== '' && part !== '.')

const chosenFolder = (files: Arriving[]) => {
  const ways = files.map((file) => wayDown(file.filename))
  if (ways.some((way) => way.length < 2)) return null
  const first = ways[0]![0]
  return ways.every((way) => way[0] === first) ? first : null
}

const importTemplate = async ({
  outputDir,
  files,
  name
}: {
  outputDir: string
  files: Arriving[]
  name?: string
}) => {
  if (files.length === 0) throw new Error('Nothing to bring in.')
  const root = path.join(outputDir, 'templates')
  const project = files.find((f) => /\.kdenlive$/i.test(f.filename))
  const archive = files.find((f) => /\.(zip|tgz|tar\.gz|tar)$/i.test(f.filename))
  const chosen = chosenFolder(files)
  const folder = folderNameOf(
    name?.trim() || chosen || path.basename((project ?? archive ?? files[0]!).filename)
  )
  if (!folder) throw new Error('Give the template a name.')

  const staging = path.join(root, `.incoming-${crypto.randomUUID()}`)
  await mkdir(staging, { recursive: true })
  const replaced = path.join(root, `.replaced-${crypto.randomUUID()}`)
  const home = path.join(root, folder)
  await inJob(
    { type: 'template', label: folder, total: project || !archive ? files.length : 1 },
    async (importing) => {
      try {
        if (project || !archive) {
          for (const file of files) {
            const way = wayDown(file.filename)
            const inside = chosen !== null ? way.slice(1) : [path.basename(file.filename)]
            if (inside.length === 0 || inside.some((part) => part === '..' || part.includes('\0')))
              throw new Error(`${file.filename} is not a name.`)
            const target = path.join(staging, ...inside)
            importing.working(path.basename(file.filename))
            await mkdir(path.dirname(target), { recursive: true })
            await copyFile(file.at, target)
            importing.step()
          }
        } else {
          importing.working(path.basename(archive.filename))
          if (/\.zip$/i.test(archive.filename)) await unzipInto(archive.at, staging)
          else await untarInto(archive.at, staging)
        }

        const inside = (await walkFiles(staging))
          .filter((f) => f.endsWith('.kdenlive'))
          .sort(
            (a, b) => a.split(path.sep).length - b.split(path.sep).length || a.localeCompare(b)
          )[0]
        if (!inside)
          throw new Error(
            'There is no kdenlive project in what was brought in — a template is a .kdenlive and the files it uses, or the archive kdenlive packs them into.'
          )
        const held = path.dirname(inside)
        await relinkTemplate(inside)
        await openToHost(held, outputDir)

        if (await pathExists(home)) await rename(home, replaced)
        try {
          await rename(held, home)
        } catch (e) {
          if ((await pathExists(replaced)) && !(await pathExists(home)))
            await rename(replaced, home)
          throw e
        }
      } finally {
        await rm(staging, { recursive: true, force: true })
        await rm(replaced, { recursive: true, force: true })
      }
    }
  )
  const made = (await listTemplates(outputDir)).templates.find((t) => t.name === folder)
  if (!made) throw new Error('The template was brought in but cannot be read as one.')
  return made
}

export { folderNameOf, importTemplate, listTemplates, setDefaultTemplate }
export type { Arriving }
