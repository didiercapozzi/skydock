import { firstSentence, groupedByRule, sharedRefusals } from './boardMap'
import type { BoardMap, MappedIntent } from './boardMap'
import { JOURNEYS, SPINE, journeysAdrift } from './boardMapJourneys'

/* The map as something to read, which is not the same as everything that is known.
 *
 * It opens with where a file goes, because that is the question somebody actually has, and then the
 * two or three journeys one at a time. Everything the board can be asked for comes after that, as
 * detail to drop into rather than a thing to read through: twenty-nine rows is a reference, and a
 * reference at the top of a page is what makes a page unreadable.
 *
 * Kept apart from the reading of the code so that what is found and how it is laid out can be
 * argued about separately. */

const MADE_BY = 'npx tsx scripts/map-the-board.ts'

/* a cell in a table cannot hold a pipe, and nothing here is worth breaking a row over */
const safe = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ')

const one = (intent: MappedIntent) => {
  const words = intent.about ? firstSentence(intent.about) : (intent.said ?? '')
  const reaches =
    intent.reaches.length > 0 ? intent.reaches.join(', ') : 'answers, and changes nothing'
  return `| \`${intent.name}\` | ${safe(words)} | ${safe(reaches)} |`
}

const refusalsOf = (intent: MappedIntent) => {
  if (intent.refusals.length === 0) return ''
  const said = intent.refusals
    .map((r) => (r.sure ? `- ${safe(r.said)}` : `- _${safe(r.said)}_`))
    .join('\n')
  return `\n<details><summary><code>${intent.name}</code> refuses</summary>\n\n${said}\n\n</details>\n`
}

const journeyOf = (title: string, said: string, drawn: string) =>
  `### ${title}\n\n${said}\n\n\`\`\`mermaid\n${drawn}\n\`\`\`\n`

const asMarkdown = (map: BoardMap) => {
  const grouped = groupedByRule(map)
  const shared = sharedRefusals(map)
  const writes = map.intents.filter((i) => i.reaches.includes('writes the record')).length
  const adrift = journeysAdrift(map.intents.map((i) => i.name))

  const head = `# Where a file goes, and what moves it

> **Generated — do not edit.** Made by \`${MADE_BY}\`, which reads the board's own code: the list of
> names a request is checked against, the table tying each name to the file answering it, and those
> files' own comments and refusals.
>
> [RULES.md](../RULES.md) says what the app does. This says how it is asked, and by what.

## From plugging a camera in

Each arrow is a thing somebody does. Nothing else moves a file.

${SPINE}

A file is only ever in one of those places, and only ever moves for one of those reasons — which is
why the board can say where everything is without remembering anything.
`

  const journeys = `\n## The journeys, one at a time\n\n${JOURNEYS.map((j) =>
    journeyOf(j.title, j.said, j.drawn)
  ).join('\n')}`

  const byRule = grouped
    .map(([rule, intents]) => {
      const rows = intents.map(one).join('\n')
      const refusals = intents.map(refusalsOf).join('')
      const title = rule === 'No rule named' ? '### No rule named' : `### ${rule}`
      const where =
        rule === 'No rule named'
          ? ''
          : `\nThe rule itself is in [RULES.md](../RULES.md), under _${rule}_.\n`
      return `${title}\n${where}\n| asked for | what it does | what it reaches |\n| --- | --- | --- |\n${rows}\n${refusals}`
    })
    .join('\n')

  const reference = `\n## Every way in, in detail

The arrows above are the ones worth remembering. These are all of them — **${map.intents.length}**,
of which **${writes}** write the board's own record — grouped by the rule each one serves, in its own
words. Worth reading when you are in one of them, not before.

${byRule}`

  const web =
    shared.length === 0
      ? ''
      : `\n## What refuses what

One rule enforced in one place is easy to see. These are enforced in several, which is the part that
is hard to hold in your head: the same sentence, said by everything that has to say it.

${shared
  .map(({ said, who }) => `**${safe(said)}**\n${who.map((w) => `\`${w}\``).join(' · ')}\n`)
  .join('\n')}`

  const doors = `
## The other ways in

These are the board's own, not everything that writes. \`api/nas\` has a list of its own,
\`api/share-link\` another, and \`api/scan\`, \`api/import\` and \`api/templates\` write with no intent
at all — the Scan button is one of those. They are named here so this does not pretend to be
everything.
`

  const trouble = [...map.trouble, ...adrift]
  const wrong =
    trouble.length === 0 ? '' : `\n## Not adding up\n\n${trouble.map((t) => `- ${t}`).join('\n')}\n`

  return `${head}${journeys}${reference}${web}${doors}${wrong}`
}

export { asMarkdown }
