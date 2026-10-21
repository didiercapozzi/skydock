import * as fs from 'node:fs'
import * as path from 'node:path'
import { expect, test } from 'vitest'

const app = path.join(import.meta.dirname, '..', '..', 'app')

/* The page loads the module that tells it the shape of a board change as it is, file by file, while it is
   developed: a value taken from the whole of the scripts reaches a node module there, which cannot be
   read in the browser, and the page reloads itself at every change it makes. */
test('the shape of a board change is taken from what the board may import, not from the whole scripts', () => {
  const source = fs.readFileSync(path.join(app, 'routes', 'manifest', 'args.ts'), 'utf8')
  const fromWhole = [...source.matchAll(/^(?:import|export)\s(?!type\s)[^;]*?from\s+'([^']+)'/gms)]
    .map((found) => found[1])
    .filter((spec) => spec === '@skydock/scripts')
  expect(fromWhole).toEqual([])
})
