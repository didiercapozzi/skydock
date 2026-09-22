/* Writes the map of what the board can be asked to do.
 *
 *   npx tsx scripts/map-the-board.ts          # writes docs/the-board-from-the-inside.md
 *   npx tsx scripts/map-the-board.ts --check  # says whether it is out of date, and changes nothing
 *
 * Nothing is drawn by hand: it reads the list of intent names every request is checked against, the
 * table that ties each name to the file answering it, and then those files — their own comments,
 * their refusals, and what each reaches for. A map drawn by hand is wrong by the next commit; this
 * one is wrong only if the code it reads is.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'
import { mapOfTheBoard } from '../packages/skydock-scripts/src/boardMap'
import { asMarkdown } from '../packages/skydock-scripts/src/boardMapPage'

const repo = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..')
const read = (file: string) => fs.readFileSync(path.join(repo, file), 'utf-8')

/* the refusals that live as constants rather than beside the refusing, resolved so the map can say
   what they say rather than naming a symbol */
const constantIn = (file: string, name: string) => {
  const said = new RegExp(`const ${name}\\s*=\\s*\\n?\\s*'([^']*)'`).exec(read(file))
  return said?.[1]
}

const known = Object.fromEntries(
  (
    [
      ['EDIT_LOCKED', constantIn('packages/skydock-scripts/src/tandem.ts', 'EDIT_LOCKED')],
      [
        'UPLOADED_LOCKED',
        constantIn('packages/skydock-scripts/src/fileStatus.ts', 'UPLOADED_LOCKED')
      ]
    ] as const
  ).flatMap(([name, said]) => (said ? [[name, said]] : []))
)

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
  known
})

const page = asMarkdown(map)
const at = path.join(repo, 'docs', 'the-board-from-the-inside.md')

if (process.argv.includes('--check')) {
  const there = fs.existsSync(at) ? fs.readFileSync(at, 'utf-8') : ''
  if (there === page) console.log(`[map] ${path.relative(repo, at)} says what the code says`)
  else {
    console.error(`[map] ${path.relative(repo, at)} is out of date — run it without --check`)
    process.exit(1)
  }
} else {
  fs.mkdirSync(path.dirname(at), { recursive: true })
  fs.writeFileSync(at, page)
  console.log(
    `[map] ${map.intents.length} intents written to ${path.relative(repo, at)}${
      map.trouble.length > 0 ? `, and ${map.trouble.length} thing(s) that do not add up` : ''
    }`
  )
  for (const trouble of map.trouble) console.log(`      ${trouble}`)
}
