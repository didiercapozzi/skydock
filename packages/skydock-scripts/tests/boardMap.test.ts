// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, it, expect } from 'vitest'
import { mapOfTheBoard } from '../src/boardMap'
import { journeysAdrift } from '../src/boardMapJourneys'

const KNOWN = {
  EDIT_LOCKED:
    'This montage has a kdenlive project — change it in kdenlive, or start the edit again.',
  UPLOADED_LOCKED: 'On the NAS — cropping, re-timing and moving are closed.'
}

describe('the map against the code it is drawn from', () => {
  const root = path.join(import.meta.dirname, '..', '..', '..')
  const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf-8')

  const map = mapOfTheBoard({
    args: read('web/app/routes/manifest/args.ts'),
    api: read('web/app/routes/api.manifest.ts'),
    sourceOf: (file) => {
      try {
        return read(file)
      } catch {
        return null
      }
    },
    known: KNOWN
  })

  it('adds up: everything that can be asked for is answered, by a file that is there', () => {
    expect(map.trouble).toEqual([])
  })

  it('has every intent a journey draws', () => {
    expect(journeysAdrift(map.intents.map((i) => i.name))).toEqual([])
  })

  it('reads the real intents, with their words and their refusals', () => {
    const deleting = map.intents.find((i) => i.name === 'delete-jump')

    expect(deleting?.rule).toBe('Jumps')
    expect(deleting?.about).toContain('A jump is deleted')
    expect(deleting?.refusals.map((r) => r.said)).toContain(
      'Something is being processed — wait for it to finish.'
    )
    expect(deleting?.reaches).toContain('writes the record')
  })
})
