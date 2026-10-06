import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { Unzip, UnzipInflate } from 'fflate'
import { inJob } from './live'
import { openToHost, walkFiles } from './lib/fs'
import { availableTemplates, defaultTemplate, DEFAULT_MARK, inspectTemplate } from './montage'
import { relinkTemplate } from './templateLinks'
import type { TemplateFact } from './templateEntry'
import { run } from './tools'

const setDefaultTemplate = (outputDir: string, name: string | null) => {
  const root = path.join(outputDir, 'templates')
  const mark = path.join(root, DEFAULT_MARK)
  if (name === null) {
    fs.rmSync(mark, { force: true })
    return { templates: listTemplates(outputDir).templates }
  }
  if (!availableTemplates(outputDir).some((t) => t.name === name))
    throw new Error(`There is no template called ${name}.`)
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(mark, `${name}\n`)
  return { templates: listTemplates(outputDir).templates }
}

const listTemplates = (outputDir: string) => {
  const byDefault = defaultTemplate(outputDir)
  const templates = availableTemplates(outputDir).map((template): TemplateFact => {
    const fact = { name: template.name, byDefault: template.name === byDefault }
    try {
      const { version, assets, missing } = inspectTemplate(template.path)
      return { ...fact, version, assets: assets.length, missing }
    } catch {
      return { ...fact, version: null, assets: 0, missing: [] }
    }
  })
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
  const unzip = new Unzip()
  unzip.register(UnzipInflate)
  unzip.onfile = (file) => {
    if (escapes(file.name)) {
      failures.push(`${file.name} would land outside the template's folder`)
      return
    }
    if (file.name.endsWith('/')) return
    const target = path.join(dir, file.name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const fd = fs.openSync(target, 'w')
    file.ondata = (error, chunk, final) => {
      if (error) failures.push(`${file.name}: ${error.message}`)
      else fs.writeSync(fd, chunk)
      if (error || final) fs.closeSync(fd)
    }
    file.start()
  }
  for await (const chunk of fs.createReadStream(archive)) unzip.push(chunk, false)
  unzip.push(new Uint8Array(0), true)
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
  fs.mkdirSync(staging, { recursive: true })
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
            await fs.promises.mkdir(path.dirname(target), { recursive: true })
            await fs.promises.copyFile(file.at, target)
            importing.step()
          }
        } else {
          importing.working(path.basename(archive.filename))
          if (/\.zip$/i.test(archive.filename)) await unzipInto(archive.at, staging)
          else await untarInto(archive.at, staging)
        }

        const inside = walkFiles(staging)
          .filter((f) => f.endsWith('.kdenlive'))
          .sort(
            (a, b) => a.split(path.sep).length - b.split(path.sep).length || a.localeCompare(b)
          )[0]
        if (!inside)
          throw new Error(
            'There is no kdenlive project in what was brought in — a template is a .kdenlive and the files it uses, or the archive kdenlive packs them into.'
          )
        const held = path.dirname(inside)
        relinkTemplate(inside)
        openToHost(held, outputDir)

        if (fs.existsSync(home)) fs.renameSync(home, replaced)
        try {
          fs.renameSync(held, home)
        } catch (e) {
          if (fs.existsSync(replaced) && !fs.existsSync(home)) fs.renameSync(replaced, home)
          throw e
        }
      } finally {
        await fs.promises.rm(staging, { recursive: true, force: true })
        await fs.promises.rm(replaced, { recursive: true, force: true })
      }
    }
  )
  const made = listTemplates(outputDir).templates.find((t) => t.name === folder)
  if (!made) throw new Error('The template was brought in but cannot be read as one.')
  return made
}

export { importTemplate, listTemplates, setDefaultTemplate }
export type { Arriving }
