import * as fs from 'node:fs'
import * as path from 'node:path'
import { groupsFileSchema, manifestSchema } from '../../../packages/skydock-scripts/src/types'
import type { World } from './app'

/* What must hold at every moment of every chapter, whatever the chapter is about: the record the app keeps
   is the record its own schema describes, and the folder it writes into holds what RULES.md says it holds. */

/* the record of a work folder read the way the app reads it — the files of the registry, and the groups
   kept beside it — and what is wrong with it, if anything; a folder with no record yet is not wrong */
const recordProblems = (world: World) => {
  const problems: string[] = []
  const read = (name: string) => {
    const file = path.join(world.output, name)
    if (!fs.existsSync(file)) return null
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
    } catch (e) {
      problems.push(`${name} is not JSON: ${(e as Error).message}`)
      return null
    }
  }
  const manifest = read('manifest.json')
  if (manifest !== null) {
    const parsed = manifestSchema.omit({ groups: true }).safeParse(manifest)
    if (!parsed.success) problems.push(`manifest.json: ${parsed.error.message.slice(0, 300)}`)
  }
  const groups = read('groups.json')
  if (groups !== null) {
    const parsed = groupsFileSchema.safeParse(groups)
    if (!parsed.success) problems.push(`groups.json: ${parsed.error.message.slice(0, 300)}`)
  }
  return problems
}

/* what the work folder holds, as the paths under it, sorted — without what is only cache, or the
   snapshots of the record, whose names are the moment they were made */
const IGNORED = /(^|\/)(\.cache|\.thumbs|\.proxies|thumbs|\.status)(\/|$)|\.tmp$|\.lock$/

const treeOf = (folder: string, base = folder): string[] =>
  fs
    .readdirSync(folder, { withFileTypes: true })
    .flatMap((entry) => {
      const here = path.join(folder, entry.name)
      const relative = path.relative(base, here)
      if (IGNORED.test(relative)) return []
      return entry.isDirectory() ? [`${relative}/`, ...treeOf(here, base)] : [relative]
    })
    .sort()

export { recordProblems, treeOf }
