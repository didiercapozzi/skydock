import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import { unzipSync, zipSync } from 'fflate'
import type { Zippable } from 'fflate'
import { getImagesDir, getMusicDir, isImageFile, isMusicFile } from './filmEdit'
import { filmTemplateSchema } from './filmTemplate'
import {
  cleanName,
  filmTemplateExists,
  readFilmTemplate,
  saveFilmTemplate
} from './filmTemplateFiles'
import { jsonText } from './lib/json'
import { filmTemplateNameOf } from './montageNames'

const BUNDLE_ENDING = '.film-template.zip'
const MOST_BYTES = 1_000_000_000
const SUFFIX = filmTemplateNameOf('')

type Bundled = { zip: Uint8Array; file: string; missing: string[] }
type Imported = {
  name: string
  renamed: boolean
  added: number
  there: number
  kept: string[]
  missing: string[]
}

const usedBy = (template: { layers?: { name?: string }[]; music: { name: string }[] }) => ({
  images: [...new Set((template.layers ?? []).flatMap((one) => (one.name ? [one.name] : [])))],
  music: [...new Set(template.music.map((one) => one.name))]
})

/* A film template with every picture and piece of music it names, in one zip: the template as it is kept,
   and the pictures and the music in folders of their own, as they are kept in the output folder. */
const bundleFilmTemplate = async (outputDir: string, name: string): Promise<Bundled> => {
  const template = await readFilmTemplate(outputDir, name)
  if (!template) throw new Error(`The film template ${name} cannot be read.`)
  const used = usedBy(template)
  const files: Zippable = {
    [`${name}${SUFFIX}`]: [
      new TextEncoder().encode(JSON.stringify(template, null, 2)),
      { level: 6 }
    ]
  }
  const missing: string[] = []
  const take = async (folder: string, from: string, names: string[]) => {
    for (const one of names) {
      const bytes = await readFile(path.join(from, one)).catch(() => null)
      if (bytes) files[`${folder}/${one}`] = [new Uint8Array(bytes), { level: 0 }]
      else missing.push(one)
    }
  }
  await take('images', getImagesDir(outputDir), used.images)
  await take('music', getMusicDir(outputDir), used.music)
  return { zip: zipSync(files), file: `${name}${BUNDLE_ENDING}`, missing }
}

const freeNameFor = async (outputDir: string, name: string) => {
  let made = name
  for (let n = 2; await filmTemplateExists(outputDir, made); n++) made = `${name} ${n}`
  return made
}

const putFile = async (dir: string, name: string, bytes: Uint8Array) => {
  await mkdir(dir, { recursive: true })
  const target = path.join(dir, name)
  const part = path.join(dir, `.${name}.arriving`)
  try {
    await writeFile(part, bytes)
    await rename(part, target)
  } finally {
    await rm(part, { force: true })
  }
}

/* The zip a film template was exported as, taken in whole: the template is kept under its own name — or the
   next free one, never over another — and the pictures and music it names are put where the editor finds
   them. A picture or a piece of music that is there already, the same, is left; one that is there under the
   same name and is another file is left too, and said. */
const importFilmTemplate = async (outputDir: string, zip: Uint8Array): Promise<Imported> => {
  let total = 0
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(zip, {
      filter: (file) => {
        total += file.originalSize
        if (total > MOST_BYTES) throw new Error('too big')
        return !file.name.endsWith('/') && file.originalSize <= MOST_BYTES
      }
    })
  } catch (e) {
    throw new Error(
      e instanceof Error && e.message === 'too big'
        ? 'That zip is too big to be a film template.'
        : 'That is not a zip SkyDock can read.'
    )
  }
  const found = Object.keys(entries).filter((one) => !one.includes('/') && one.endsWith(SUFFIX))
  if (found.length !== 1) throw new Error('That zip holds no film template exported from SkyDock.')
  const file = found[0]!
  const parsed = jsonText
    .pipe(filmTemplateSchema)
    .safeParse(new TextDecoder().decode(entries[file]))
  if (!parsed.success) throw new Error('The film template in that zip cannot be read.')
  const template = parsed.data
  const wanted = usedBy(template)

  const result: Imported = { name: '', renamed: false, added: 0, there: 0, kept: [], missing: [] }
  const take = async (
    folder: string,
    into: string,
    names: string[],
    allowed: (n: string) => boolean
  ) => {
    for (const one of names) {
      const bytes = entries[`${folder}/${one}`]
      if (!bytes || path.basename(one) !== one || !allowed(one)) {
        result.missing.push(one)
        continue
      }
      const here = await stat(path.join(into, one)).catch(() => null)
      if (!here) {
        await putFile(into, one, bytes)
        result.added++
      } else if (here.size === bytes.length) result.there++
      else result.kept.push(one)
    }
  }
  await take('images', getImagesDir(outputDir), wanted.images, isImageFile)
  await take('music', getMusicDir(outputDir), wanted.music, isMusicFile)

  const asked = cleanName(file.slice(0, -SUFFIX.length))
  result.name = await freeNameFor(outputDir, asked)
  result.renamed = result.name !== asked
  await saveFilmTemplate({ outputDir, name: result.name, template, replace: false })
  return result
}

export { BUNDLE_ENDING, bundleFilmTemplate, importFilmTemplate }
export type { Bundled, Imported }
