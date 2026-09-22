// @vitest-environment node
import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  commentAbove,
  firstSentence,
  intentFiles,
  intentsNamed,
  mapOfTheBoard,
  refusalsIn,
  ruleCited,
  sharedRefusals
} from '../src/boardMap'
import { JOURNEYS, SPINE, journeysAdrift } from '../src/boardMapJourneys'

/* The map of what the board can be asked to do is read out of the code rather than written down,
   so what matters is that it reads what is there and says so when the code stops adding up: a name
   nothing answers, or something answered that cannot be asked for, is the drift the map exists to
   catch. Everything below is the shapes the intents are really written in. */

const KNOWN = {
  EDIT_LOCKED: 'This tandem has an edit — change it in kdenlive.',
  UPLOADED_LOCKED: 'On the NAS — cropping, re-timing and moving are closed.'
}

describe('the words above an intent', () => {
  const source = `import { saveManifest } from '@skydock/scripts'

/* a comment about the import, not about the work */
import { deleteJump } from '../../../../packages/skydock-scripts/src/moveFiles'

/* A jump is deleted and its files go back to Unsorted, loose (RULES, Jumps). Not a tandem with an
   edit, and not while something is being processed. */
const deleteJumpIntent: Intent = ({ refuse }) => refuse('no')
`

  it('are the ones written above it, not an earlier comment about something else', () => {
    const at = source.search(/^const deleteJumpIntent\b/m)

    const said = commentAbove(source, at)

    expect(said).toContain('A jump is deleted')
    expect(said).not.toContain('about the import')
  })

  it('are read as one line, however they were laid out to be read', () => {
    const at = source.search(/^const deleteJumpIntent\b/m)

    expect(commentAbove(source, at)).toContain('go back to Unsorted, loose (RULES, Jumps).')
  })

  it('give up the rule they serve, and the first thing they say', () => {
    const about = commentAbove(source, source.search(/^const deleteJumpIntent\b/m)) ?? ''

    expect(ruleCited(about)).toBe('Jumps')
    expect(firstSentence(about)).toBe(
      'A jump is deleted and its files go back to Unsorted, loose (RULES, Jumps).'
    )
  })
})

describe('what an intent refuses', () => {
  it('is lifted word for word where the words are there', () => {
    const body = `const x = ({ refuse }) => {
      if (gone) return refuse('That jump is no longer on the board.')
      if (busy) return refuse('Something is being processed — wait for it to finish.')
    }`

    expect(refusalsIn(body, KNOWN)).toEqual([
      { said: 'That jump is no longer on the board.', sure: true },
      { said: 'Something is being processed — wait for it to finish.', sure: true }
    ])
  })

  /* a tool's own words, passed on: they can be named but not quoted, and inventing them would be
     the one thing a generated map must never do */
  it('is named rather than invented where the words come from underneath', () => {
    const body = `const x = ({ refuse }) => {
      try { work() } catch (e) { return refuse(e instanceof Error ? e.message : String(e)) }
    }`

    expect(refusalsIn(body, KNOWN)).toEqual([
      { said: 'whatever went wrong underneath, in its own words', sure: false }
    ])
  })

  it('is the shared one where the shared one is used', () => {
    const body = `const x = ({ refuseFrozen }) => refuseFrozen()`

    expect(refusalsIn(body, KNOWN)).toEqual([{ said: KNOWN.EDIT_LOCKED, sure: true }])
  })

  it('is said once however many times it is said', () => {
    const body = `const x = ({ refuse }) => {
      if (a) return refuse('Group not found.')
      if (b) return refuse('Group not found.')
    }`

    expect(refusalsIn(body, KNOWN)).toHaveLength(1)
  })
})

describe('the list of what can be asked for', () => {
  const args = `const actionArgs = z.object({
    intent: z.enum([
      'save-groups',
      /* a page that came back while something was being processed waits here for it to finish */
      'process-wait',
      'montage'
    ]),
    groupId: z.string().optional()
  })`

  it('is every name in it, with whatever was said beside each', () => {
    expect(intentsNamed(args)).toEqual([
      { name: 'save-groups', said: null },
      {
        name: 'process-wait',
        said: 'a page that came back while something was being processed waits here for it to finish'
      },
      { name: 'montage', said: null }
    ])
  })

  it('stops at the end of the list, and does not read the fields after it', () => {
    expect(intentsNamed(args).map((i) => i.name)).not.toContain('groupId')
  })
})

describe('what answers each name', () => {
  /* the three ways the table is written: named, named with quotes, and written once where the name
     and the function are the same word */
  const api = `import { deleteJumpIntent } from './manifest/delete-jump'
import { montage } from './manifest/montage'
import { cameraCopied } from './manifest/camera-copied'

const intents: Record<ActionData['intent'], Intent> = {
  'delete-jump': deleteJumpIntent,
  montage,
  'camera-copied': cameraCopied
}`

  it('is found however the table writes it, including the last row with no comma', () => {
    const answered = intentFiles(api)

    expect(answered.get('delete-jump')).toEqual({
      symbol: 'deleteJumpIntent',
      file: 'web/app/routes/manifest/delete-jump.ts'
    })
    expect(answered.get('montage')).toEqual({
      symbol: 'montage',
      file: 'web/app/routes/manifest/montage.ts'
    })
    expect(answered.get('camera-copied')?.file).toBe('web/app/routes/manifest/camera-copied.ts')
  })
})

describe('an intent made by calling something else in the same file', () => {
  it('is read as the thing it calls, since that is where the work is', () => {
    const args = `z.enum(['reset-tandem'])`
    const api = `import { resetTandemIntent } from './manifest/take-back'
const intents: Record<ActionData['intent'], Intent> = {
  'reset-tandem': resetTandemIntent
}`
    const file = `/* Back to before processing, keeping every decision (RULES, Taking a tandem back). */
const takeBack =
  (take) =>
  ({ manifestPath, manifest, refuse }) => {
    if (busy) return refuse('This tandem is being processed — wait for it to finish.')
    saveManifest(manifestPath, manifest)
  }

const resetTandemIntent = takeBack(resetTandem)

export { resetTandemIntent }`

    const map = mapOfTheBoard({ args, api, sourceOf: () => file, known: KNOWN })

    const [intent] = map.intents
    expect(intent?.rule).toBe('Taking a tandem back')
    expect(intent?.refusals).toEqual([
      { said: 'This tandem is being processed — wait for it to finish.', sure: true }
    ])
    expect(intent?.reaches).toContain('writes the record')
  })
})

describe('a map that does not add up', () => {
  const file = `/* does a thing */
const somethingIntent: Intent = () => null
`

  it('says so when a name can be asked for and nothing answers it', () => {
    const map = mapOfTheBoard({
      args: `z.enum(['save-groups', 'montage'])`,
      api: `import { saveGroups } from './manifest/save-groups'
const intents: Record<ActionData['intent'], Intent> = { 'save-groups': saveGroups }`,
      sourceOf: () => file,
      known: KNOWN
    })

    expect(map.trouble).toContain('montage can be asked for, and nothing answers it')
  })

  it('says so when something is answered that cannot be asked for', () => {
    const map = mapOfTheBoard({
      args: `z.enum(['save-groups'])`,
      api: `import { saveGroups } from './manifest/save-groups'
import { ghost } from './manifest/ghost'
const intents: Record<ActionData['intent'], Intent> = {
  'save-groups': saveGroups,
  ghost
}`,
      sourceOf: () => file,
      known: KNOWN
    })

    expect(map.trouble).toContain('ghost is answered, and cannot be asked for')
  })

  it('says so when the file the table names is not there', () => {
    const map = mapOfTheBoard({
      args: `z.enum(['save-groups'])`,
      api: `import { saveGroups } from './manifest/save-groups'
const intents: Record<ActionData['intent'], Intent> = { 'save-groups': saveGroups }`,
      sourceOf: () => null,
      known: KNOWN
    })

    expect(map.trouble).toEqual([
      'save-groups names web/app/routes/manifest/save-groups.ts, which is not there'
    ])
  })
})

/* One rule enforced in seven places is only visible when the seven are put together — which is the
   whole reason for the map. */
describe('a refusal more than one intent makes', () => {
  it('is gathered with everyone who makes it, and one nobody shares is left out', () => {
    const map = {
      intents: [
        { name: 'a', refusals: [{ said: 'wait for it', sure: true }] },
        { name: 'b', refusals: [{ said: 'wait for it', sure: true }] },
        { name: 'c', refusals: [{ said: 'only this one says this', sure: true }] }
      ],
      trouble: []
    } as unknown as Parameters<typeof sharedRefusals>[0]

    expect(sharedRefusals(map)).toEqual([{ said: 'wait for it', who: ['a', 'b'] }])
  })
})

/* The journeys are drawn by hand, because no code says which case matters — so the one thing that
   must hold is that they still name things the board can really be asked for, and that the board's
   own three lists still agree with each other. Read against the repository itself: if an intent is
   renamed and a drawing is not, this is what says so. */
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

  /* a drawing that will not draw is worse than none: every label holding a comma or an apostrophe
     has to be quoted, or the picture is a parse error where a picture should be */
  it('draws with every awkward label quoted', () => {
    const lines = [SPINE, ...JOURNEYS.map((j) => j.drawn)].join('\n').split('\n')
    const awkward = lines.filter((line) => /\[\(?[^"'\]]*[,'][^"\]]*\)?\]/.test(line))

    expect(awkward).toEqual([])
  })
})
