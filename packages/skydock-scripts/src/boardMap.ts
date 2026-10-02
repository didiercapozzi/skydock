/* The board's write surface, read out of the code that implements it.
 *
 * Everything the board can ask for goes through one intent, and each one lives in its own file with
 * its own words above it, its own refusals, and its own reach — some only rewrite the record, some
 * shell out to ffmpeg, some need the storage. That is the part of the app no prose covers: the
 * rules say what it does, and this says which of the twenty-nine ways in does it, and what stops
 * each one.
 *
 * Read rather than written down, because a map drawn by hand is a map that is wrong by the next
 * commit. Everything here comes out of four things the code already keeps true: the list of names
 * the request is validated against, the table that ties each name to its file, the comment above
 * each intent, and the one way any of them has of refusing.
 */

/* what an intent says no to. `sure` is false where the message is whatever failed underneath — a
   tool's own words, passed on — which can be named but not quoted */
type Refusal = { said: string; sure: boolean }

/* what an intent reaches for beyond answering: the board's own record, the machine, the storage */
type Reach =
  | 'writes the record'
  | 'needs the storage'
  | 'writes the storage’s list'
  | 'works outside the record'
  | 'says how far it has got'

type MappedIntent = {
  name: string
  /* the words beside the name in the list every request is checked against */
  said: string | null
  file: string | null
  symbol: string | null
  /* the words above the intent itself */
  about: string | null
  /* the rule it serves, where it names one */
  rule: string | null
  refusals: Refusal[]
  reaches: Reach[]
}

/* a map that does not add up is worth more than one that quietly leaves something out */
type BoardMap = { intents: MappedIntent[]; trouble: string[] }

/* a block comment as one line: the leading stars and the indentation that made it readable in the
   file are not part of what it says */
const tidy = (comment: string) =>
  comment
    .replace(/^\/\*+/, '')
    .replace(/\*+\/$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*?\s?/, '').trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

/* The first thing it says. A comment here opens with what the intent does and then explains itself,
   so the opening sentence is the line for a list — with a rule cited at the end of it left where it
   is, since that is where the reader goes next. */
const firstSentence = (text: string) => {
  const end = text.search(/\.(?:\s|$)/)
  return end === -1 ? text : text.slice(0, end + 1)
}

const ruleCited = (text: string) => /\(RULES,\s*([^)]+)\)/.exec(text)?.[1]?.trim() ?? null

/* The comment written above a declaration, when one was. Anything but whitespace between the two
   means the comment was about something else, and is left alone. */
const commentAbove = (source: string, at: number) => {
  const before = source.slice(0, at)
  const closed = before.lastIndexOf('*/')
  if (closed === -1) return null
  if (before.slice(closed + 2).trim() !== '') return null
  const opened = before.lastIndexOf('/*', closed)
  return opened === -1 ? null : tidy(before.slice(opened, closed + 2))
}

/* Every name the board may ask for, with whatever was said beside it. The list is the one a
   request is validated against, so nothing can be asked for that is not in it. */
const intentsNamed = (args: string) => {
  const from = args.indexOf('z.enum([')
  if (from === -1) return []
  const to = args.indexOf('])', from)
  const block = args.slice(from + 'z.enum(['.length, to === -1 ? undefined : to)
  const named: { name: string; said: string | null }[] = []
  for (const found of block.matchAll(/(?:\/\*([\s\S]*?)\*\/\s*)?'([a-z][a-z-]*)'/g))
    named.push({ name: found[2] ?? '', said: found[1] ? tidy(`/*${found[1]}*/`) : null })
  return named
}

/* Which file answers each name. The table names a function and the imports say where it came from,
   so the two together are the only honest way to get from a name to the code. */
const intentFiles = (api: string) => {
  const from = new Map<string, string>()
  for (const line of api.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/(manifest\/[\w-]+)'/g))
    for (const symbol of (line[1] ?? '').split(','))
      if (symbol.trim()) from.set(symbol.trim(), `web/app/routes/${line[2]}.ts`)

  const opens = api.indexOf('const intents')
  if (opens === -1) return new Map<string, { symbol: string; file: string | null }>()
  const table = api.slice(api.indexOf('{', opens) + 1, api.indexOf('\n}', opens))
  const answered = new Map<string, { symbol: string; file: string | null }>()
  /* `'free-montage': freeMontageIntent` and `montage` alike: a name whose function is called the same
     thing is written once, and means the same as writing it twice */
  for (const found of table.matchAll(/'?([a-z][a-z-]*)'?\s*(?::\s*(\w+))?\s*(?:,|$)/gm)) {
    const symbol = found[2] ?? found[1] ?? ''
    answered.set(found[1] ?? '', { symbol, file: from.get(symbol) ?? null })
  }
  return answered
}

/* One intent's own body: from where it is declared to wherever the next declaration starts, so a
   file holding three of them is read as three. */
const bodyOf = (source: string, symbol: string): { at: number; text: string } | null => {
  const at = source.search(new RegExp(`^const ${symbol}\\b`, 'm'))
  if (at === -1) return null
  const next = source.slice(at + 1).search(/^const \w/m)
  const text = next === -1 ? source.slice(at) : source.slice(at, at + 1 + next)
  /* An intent made by calling something else in the same file — two of them being the same work
     with one word changed — is that thing: what it refuses and what it writes are in there, and so
     are the words written above it. */
  if (!/=>/.test(text)) {
    const made = /=\s*(\w+)\(/.exec(text)?.[1]
    if (made && made !== symbol) return bodyOf(source, made) ?? { at, text }
  }
  return { at, text }
}

const REACHES: [RegExp, Reach][] = [
  [/\bsaveManifest\(/, 'writes the record'],
  [/\bensureNasSession\(/, 'needs the storage'],
  [/\brecordOnStorage\(/, 'writes the storage’s list'],
  [/\buploadReporter\(/, 'says how far it has got']
]

/* What an intent says no to. There is one way to refuse and it takes a message, so the messages are
   liftable word for word — except where the message is whatever failed underneath, which is named
   as that rather than invented. `known` carries the refusals that live as constants elsewhere. */
const refusalsIn = (body: string, known: Record<string, string>) => {
  const refusals: Refusal[] = []
  const add = (said: string, sure: boolean) => {
    if (!refusals.some((r) => r.said === said)) refusals.push({ said, sure })
  }
  for (const found of body.matchAll(/refuse\(\s*(?:'([^']*)'|`([^`${]*)`|([A-Za-z_$][\w$]*))/g)) {
    const [, quoted, backticked, named] = found
    if (quoted !== undefined || backticked !== undefined)
      add((quoted ?? backticked) as string, true)
    else if (named && known[named]) add(known[named], true)
    else add('whatever went wrong underneath, in its own words', false)
  }
  if (/refuse\(\s*`[^`]*\$\{/.test(body)) add('a message naming the file or the jump', false)
  if (/\brefuseFrozen\(\)/.test(body) && known.EDIT_LOCKED) add(known.EDIT_LOCKED, true)
  return refusals
}

/* Everything known about one intent, from the file that answers it. */
const readIntent = (
  name: string,
  said: string | null,
  answered: { symbol: string; file: string | null } | undefined,
  source: string | null,
  known: Record<string, string>
): MappedIntent => {
  const bare = { name, said, file: answered?.file ?? null, symbol: answered?.symbol ?? null }
  if (!source || !answered) return { ...bare, about: null, rule: null, refusals: [], reaches: [] }
  const body = bodyOf(source, answered.symbol)
  const about = body ? commentAbove(source, body.at) : null
  const reaches = REACHES.flatMap(([looks, reach]) => (looks.test(body?.text ?? '') ? [reach] : []))
  /* a deep import is the package's own rule: what shells out or reaches the disk is imported from
     its module rather than through the barrel the browser may see */
  if (/from '(?:\.\.\/)+packages\/skydock-scripts\/src\//.test(source))
    reaches.push('works outside the record')
  return {
    ...bare,
    about,
    rule: about ? ruleCited(about) : null,
    refusals: refusalsIn(body?.text ?? '', known),
    reaches
  }
}

/* The whole surface, and whatever does not add up. */
const mapOfTheBoard = ({
  args,
  api,
  sourceOf,
  known
}: {
  args: string
  api: string
  /* the text of an intent's file, by the path the table led to */
  sourceOf: (file: string) => string | null
  known: Record<string, string>
}): BoardMap => {
  const named = intentsNamed(args)
  const answered = intentFiles(api)
  const trouble: string[] = []
  const intents = named.map(({ name, said }) => {
    const answer = answered.get(name)
    if (!answer) trouble.push(`${name} can be asked for, and nothing answers it`)
    const source = answer?.file ? sourceOf(answer.file) : null
    if (answer?.file && source === null)
      trouble.push(`${name} names ${answer.file}, which is not there`)
    if (answer && !answer.file)
      trouble.push(`${name} answers with ${answer.symbol}, imported from nowhere`)
    return readIntent(name, said, answer, source, known)
  })
  for (const name of answered.keys())
    if (!named.some((n) => n.name === name))
      trouble.push(`${name} is answered, and cannot be asked for`)
  return { intents, trouble }
}

/* Those that share a refusal, which is the web no prose covers: one rule, enforced in seven places,
   is only visible when the seven are put together. */
const sharedRefusals = (map: BoardMap) => {
  const by = new Map<string, string[]>()
  for (const intent of map.intents)
    for (const refusal of intent.refusals)
      if (refusal.sure) by.set(refusal.said, [...(by.get(refusal.said) ?? []), intent.name])
  return [...by.entries()]
    .filter(([, who]) => who.length > 1)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([said, who]) => ({ said, who }))
}

const groupedByRule = (map: BoardMap) => {
  const by = new Map<string, MappedIntent[]>()
  for (const intent of map.intents) {
    const rule = intent.rule ?? 'No rule named'
    by.set(rule, [...(by.get(rule) ?? []), intent])
  }
  return [...by.entries()].sort(([a], [b]) =>
    a === 'No rule named' ? 1 : b === 'No rule named' ? -1 : a.localeCompare(b)
  )
}

export {
  commentAbove,
  firstSentence,
  groupedByRule,
  intentFiles,
  intentsNamed,
  mapOfTheBoard,
  refusalsIn,
  ruleCited,
  sharedRefusals,
  tidy
}
export type { BoardMap, MappedIntent, Refusal }
