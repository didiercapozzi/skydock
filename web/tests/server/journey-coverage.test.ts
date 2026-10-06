import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'
import { describe, expect, test } from 'vitest'

/* The journey walks the whole app, so a feature RULES.md names that no chapter of it guards is a hole in
   the walk. Every `##` heading and every bold lead-in of RULES.md is one feature; each must be claimed by a
   chapter of the journey (a test that exists) or be on the list of what the journey does not cover, with the
   reason. A claim of a chapter that is not there, or of a feature RULES.md does not have, fails too — so the
   map cannot drift from either side. */

const here = path.dirname(url.fileURLToPath(import.meta.url))
const JOURNEY = path.join(here, '..', 'journey')
const RULES = path.join(here, '..', '..', '..', 'RULES.md')

type Fragment = { covers?: Record<string, string[]>; exempt?: Record<string, string> }

/* a feature is named as RULES.md names it, without the stop that ends its sentence or the italics */
const clean = (name: string) =>
  name
    .replace(/[.:]+$/, '')
    .replace(/_/g, '')
    .trim()

const featuresOf = (text: string) => {
  const names: string[] = []
  for (const line of text.split('\n')) {
    const heading = /^## (.+)$/.exec(line)
    const lead = /^\*\*(.+?)\*\*/.exec(line)
    const name = heading?.[1] ?? lead?.[1]
    if (name) names.push(clean(name))
  }
  return names
}

const filesUnder = (folder: string): string[] =>
  fs
    .readdirSync(folder, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? entry.name.startsWith('.') || entry.name === 'videos' || entry.name === 'screens'
          ? []
          : filesUnder(path.join(folder, entry.name))
        : [path.join(folder, entry.name)]
    )

const load = async () => {
  const covers: Record<string, string[]> = {}
  const exempt: Record<string, string> = {}
  const folder = path.join(JOURNEY, 'coverage')
  for (const file of fs.readdirSync(folder).filter((name) => name.endsWith('.ts'))) {
    const fragment = (await import(path.join(folder, file))) as Fragment
    for (const [feature, chapters] of Object.entries(fragment.covers ?? {}))
      covers[feature] = [...(covers[feature] ?? []), ...chapters]
    Object.assign(exempt, fragment.exempt ?? {})
  }
  return { covers, exempt }
}

const features = featuresOf(fs.readFileSync(RULES, 'utf8'))
const chapters = filesUnder(JOURNEY)
  .filter((file) => file.endsWith('.test.ts'))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n')

describe('the journey and RULES.md', () => {
  test('every feature RULES.md names has a chapter in the journey, or says why not', async () => {
    const { covers, exempt } = await load()
    const missing = features.filter((name) => !(name in covers) && !(name in exempt))
    expect(missing, 'features with no chapter and no reason').toEqual([])
  })

  test('every chapter a feature is claimed by is in the journey', async () => {
    const { covers } = await load()
    const absent = Object.entries(covers).flatMap(([feature, titles]) =>
      titles.filter((title) => !chapters.includes(title)).map((title) => `${feature}: ${title}`)
    )
    expect(absent, 'chapters claimed that no test has').toEqual([])
  })

  test('nothing is claimed or excused for a feature RULES.md does not have', async () => {
    const { covers, exempt } = await load()
    const known = new Set(features)
    const stale = [...Object.keys(covers), ...Object.keys(exempt)].filter(
      (name) => !known.has(name)
    )
    expect(stale, 'features that are not in RULES.md').toEqual([])
  })

  test('a feature is either covered or excused, never both', async () => {
    const { covers, exempt } = await load()
    expect(Object.keys(covers).filter((name) => name in exempt)).toEqual([])
  })

  test('every excuse says why', async () => {
    const { exempt } = await load()
    expect(Object.entries(exempt).filter(([, why]) => why.trim().length < 12)).toEqual([])
  })
})
