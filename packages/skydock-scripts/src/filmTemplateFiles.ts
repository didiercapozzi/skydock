import { constants } from 'node:fs'
import { copyFile, link, mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import * as path from 'node:path'
import { getImagesDir, getMusicDir, isMusicFile } from './filmEdit'
import { filmTemplateSchema } from './filmTemplate'
import type { FilmTemplate } from './filmTemplate'
import { jsonText } from './lib/json'
import { openToHost, pathExists, writeJsonAtomic } from './lib/fs'
import { filmTemplateNameOf } from './montageNames'
import { UNDER_SOUND } from './filmEditShape'

const NAME_MAX = 60
const FILE_MAX = 500_000
const NAME_BYTES = 200
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i
const SUFFIX = filmTemplateNameOf('')

const folderOf = (outputDir: string) => path.join(outputDir, 'film-templates')

const tidy = (raw: string) =>
  raw
    .normalize('NFC')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/^\.+/, '')
    .trim()

const fileOf = (outputDir: string, name: string) =>
  path.join(folderOf(outputDir), filmTemplateNameOf(tidy(name)))

const cleanName = (raw: string) => {
  const name = tidy(raw)
  if (!name) throw new Error('Give the film template a name.')
  if (name.length > NAME_MAX || Buffer.byteLength(name) > NAME_BYTES)
    throw new Error('Keep it under 60 characters.')
  if (name.endsWith('.') || [...name].some((c) => c < ' ') || RESERVED.test(name.split('.')[0]))
    throw new Error('That name cannot be used for a file.')
  return name
}

let queue: Promise<unknown> = Promise.resolve()

const alone = <T>(job: () => Promise<T>) => {
  const run = queue.then(job)
  queue = run.catch(() => null)
  return run
}

const taken = (name: string) => new Error(`There is already a film template called ${name}.`)

const mustExist = async (outputDir: string, name: string) => {
  if (!(await pathExists(fileOf(outputDir, name))))
    throw new Error(`There is no film template called ${name}.`)
}

const readTemplate = async (outputDir: string, name: string) => {
  const file = fileOf(outputDir, name)
  if (((await stat(file).catch(() => null))?.size ?? 0) > FILE_MAX) return null
  const text = await readFile(file, 'utf-8').catch(() => null)
  const parsed = text === null ? null : jsonText.pipe(filmTemplateSchema).safeParse(text)
  return parsed?.success ? parsed.data : null
}

const listFilmTemplates = async (outputDir: string) => {
  const music = new Set(
    (await readdir(getMusicDir(outputDir)).catch(() => [])).filter((name) => isMusicFile(name))
  )
  const pictures = new Set(await readdir(getImagesDir(outputDir)).catch(() => []))
  const names = (await readdir(folderOf(outputDir)).catch(() => []))
    .filter((file) => !file.startsWith('.') && file.endsWith(SUFFIX))
    .map((file) => file.slice(0, -SUFFIX.length))
    .sort((a, b) => a.localeCompare(b))
  const found = await Promise.all(
    names.map(async (name) => ({ name, template: await readTemplate(outputDir, name) }))
  )
  return {
    templates: found.flatMap(({ name, template }) =>
      template
        ? [
            {
              name,
              template,
              missing: [
                ...template.music.map((p) => p.name).filter((n) => !music.has(n)),
                ...(template.layers ?? [])
                  .flatMap((l) => (l.name ? [l.name] : []))
                  .filter((n) => !pictures.has(n))
              ]
            }
          ]
        : []
    ),
    broken: found.filter(({ template }) => !template).map(({ name }) => name)
  }
}

const claim = async (from: string, to: string, name: string) => {
  try {
    await link(from, to).catch((e: NodeJS.ErrnoException) =>
      e.code === 'EPERM' || e.code === 'ENOTSUP'
        ? copyFile(from, to, constants.COPYFILE_EXCL)
        : Promise.reject(e)
    )
  } catch (e) {
    throw (e as NodeJS.ErrnoException).code === 'EEXIST' ? taken(name) : e
  }
}

const publish = async (outputDir: string, name: string, template: FilmTemplate, free: boolean) => {
  await mkdir(folderOf(outputDir), { recursive: true })
  const target = fileOf(outputDir, name)
  if (!free) await writeJsonAtomic(target, template)
  else {
    const tmp = `${target}.${process.pid}.${Date.now()}.new`
    await writeJsonAtomic(tmp, template)
    try {
      await claim(tmp, target, name)
    } finally {
      await rm(tmp, { force: true })
    }
  }
  await openToHost(folderOf(outputDir), outputDir)
}

const saveFilmTemplate = ({
  outputDir,
  name: raw,
  template,
  replace
}: {
  outputDir: string
  name: string
  template: FilmTemplate
  replace: boolean
}) =>
  alone(async () => {
    const name = cleanName(raw)
    await publish(outputDir, name, template, !replace)
    return name
  })

const updateFilmTemplate = (outputDir: string, raw: string, template: FilmTemplate) =>
  alone(async () => {
    const name = cleanName(raw)
    await mustExist(outputDir, name)
    await publish(outputDir, name, template, false)
    return name
  })

const createFilmTemplate = (outputDir: string, name: string) =>
  saveFilmTemplate({
    outputDir,
    name,
    template: { version: 1, length: 60, underSound: UNDER_SOUND, texts: [], music: [] },
    replace: false
  })

const renameFilmTemplate = (outputDir: string, name: string, to: string) =>
  alone(async () => {
    const next = cleanName(to)
    await mustExist(outputDir, name)
    if (next === name) return next
    const there = await stat(fileOf(outputDir, next)).catch(() => null)
    const here = await stat(fileOf(outputDir, name))
    if (there && there.ino === here.ino && there.dev === here.dev)
      await rename(fileOf(outputDir, name), fileOf(outputDir, next))
    else {
      await claim(fileOf(outputDir, name), fileOf(outputDir, next), next)
      await rm(fileOf(outputDir, name))
    }
    return next
  })

const duplicateFilmTemplate = (outputDir: string, name: string) =>
  alone(async () => {
    await mustExist(outputDir, name)
    const template = await readTemplate(outputDir, name)
    if (!template) throw new Error(`The film template ${name} cannot be read.`)
    let base = name.slice(0, NAME_MAX - 10)
    while (/[\uD800-\uDBFF]$/.test(base) || Buffer.byteLength(base) > NAME_BYTES - 10)
      base = base.slice(0, -1)
    let copy = `${base} copy`
    for (let n = 2; await pathExists(fileOf(outputDir, copy)); n++) copy = `${base} copy ${n}`
    const made = cleanName(copy)
    await publish(outputDir, made, template, true)
    return made
  })

const deleteFilmTemplate = (outputDir: string, name: string) =>
  alone(async () => {
    await mustExist(outputDir, name)
    await rm(fileOf(outputDir, name))
  })

const filmTemplateExists = (outputDir: string, name: string) => pathExists(fileOf(outputDir, name))

export {
  cleanName,
  createFilmTemplate,
  deleteFilmTemplate,
  duplicateFilmTemplate,
  filmTemplateExists,
  listFilmTemplates,
  readTemplate as readFilmTemplate,
  renameFilmTemplate,
  saveFilmTemplate,
  updateFilmTemplate
}
