import * as fs from 'node:fs'
import * as path from 'node:path'
import { XMLBuilder } from 'fast-xml-parser'
import { z } from 'zod'
import { XML_OPTIONS, attrsOf, walkAssets } from './lib/mlt'
import { walkFiles } from './lib/fs'
import { readTemplate } from './montage'

const filesBeside = (dir: string) => {
  const by = new Map<string, string>()
  for (const file of walkFiles(dir)) {
    const name = path.basename(file)
    const held = by.get(name)
    if (!held || file.split(path.sep).length < held.split(path.sep).length) by.set(name, file)
  }
  return by
}

const wayTo = (dir: string, target: string) => path.relative(dir, target).split(path.sep).join('/')

type Relinked = { relinked: string[]; missing: string[] }

const relinkTemplate = (projectPath: string): Relinked => {
  const { document, mltNode, mlt } = readTemplate(projectPath)
  const dir = path.dirname(projectPath)
  const beside = filesBeside(dir)
  const relinked: string[] = []
  const missing: string[] = []

  const wayToItsCopy = (named: string) => {
    const name = path.basename(named)
    const here = beside.get(name)
    if (!here) {
      if (!missing.includes(name)) missing.push(name)
      return null
    }
    const way = wayTo(dir, here)
    if (way === named) return null
    if (!relinked.includes(name)) relinked.push(name)
    return way
  }

  walkAssets(mlt, wayToItsCopy)

  const recorded = attrsOf(mltNode)['@_root']
  if (recorded !== undefined && recorded !== '') attrsOf(mltNode)['@_root'] = ''

  if (relinked.length === 0 && (recorded === undefined || recorded === ''))
    return { relinked, missing }

  const built = z
    .string()
    .parse(
      new XMLBuilder({ ...XML_OPTIONS, format: true, suppressEmptyNode: true }).build(document)
    )
  fs.writeFileSync(
    projectPath,
    built.startsWith('<?xml') ? built : `<?xml version='1.0' encoding='utf-8'?>\n${built}`,
    'utf-8'
  )
  return { relinked, missing }
}

export { relinkTemplate }
