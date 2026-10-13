import * as fs from 'node:fs'
import * as path from 'node:path'
import { expect, test } from 'vitest'

const src = path.join(import.meta.dirname, '..', 'src')

const importsOf = (file: string) =>
  [
    ...fs
      .readFileSync(file, 'utf8')
      .matchAll(/^(?:import|export)\s(?!type\s)[^;]*?from\s+'([^']+)'/gms)
  ].map((found) => found[1] as string)

const reach = (entry: string) => {
  const seen = new Set<string>()
  const foreign: string[] = []
  const visit = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    for (const spec of importsOf(file)) {
      if (spec.startsWith('node:')) foreign.push(`${path.relative(src, file)} → ${spec}`)
      else if (spec.startsWith('.')) {
        const base = path.resolve(path.dirname(file), spec)
        visit(fs.existsSync(`${base}.ts`) ? `${base}.ts` : path.join(base, 'index.ts'))
      }
    }
  }
  visit(entry)
  return foreign
}

test('what the board imports from the scripts reaches no node module', () => {
  expect(reach(path.join(src, 'client.ts'))).toEqual([])
})
