type Refusal = { said: string; sure: boolean }

type Reach =
  | 'writes the record'
  | 'needs the storage'
  | 'writes the storage’s list'
  | 'works outside the record'
  | 'says how far it has got'

type MappedIntent = {
  name: string
  said: string | null
  file: string | null
  symbol: string | null
  about: string | null
  rule: string | null
  refusals: Refusal[]
  reaches: Reach[]
}

type BoardMap = { intents: MappedIntent[]; trouble: string[] }

const tidy = (comment: string) =>
  comment
    .replace(/^\/\*+/, '')
    .replace(/\*+\/$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*?\s?/, '').trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

const firstSentence = (text: string) => {
  const end = text.search(/\.(?:\s|$)/)
  return end === -1 ? text : text.slice(0, end + 1)
}

const ruleCited = (text: string) => /\(RULES,\s*([^)]+)\)/.exec(text)?.[1]?.trim() ?? null

const commentAbove = (source: string, at: number) => {
  const before = source.slice(0, at)
  const closed = before.lastIndexOf('*/')
  if (closed === -1) return null
  if (before.slice(closed + 2).trim() !== '') return null
  const opened = before.lastIndexOf('/*', closed)
  return opened === -1 ? null : tidy(before.slice(opened, closed + 2))
}

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

const intentFiles = (api: string) => {
  const from = new Map<string, string>()
  for (const line of api.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/(manifest\/[\w-]+)'/g))
    for (const symbol of (line[1] ?? '').split(','))
      if (symbol.trim()) from.set(symbol.trim(), `web/app/routes/${line[2]}.ts`)

  const opens = api.indexOf('const intents')
  if (opens === -1) return new Map<string, { symbol: string; file: string | null }>()
  const table = api.slice(api.indexOf('{', opens) + 1, api.indexOf('\n}', opens))
  const answered = new Map<string, { symbol: string; file: string | null }>()
  for (const found of table.matchAll(/'?([a-z][a-z-]*)'?\s*(?::\s*(\w+))?\s*(?:,|$)/gm)) {
    const symbol = found[2] ?? found[1] ?? ''
    answered.set(found[1] ?? '', { symbol, file: from.get(symbol) ?? null })
  }
  return answered
}

const bodyOf = (source: string, symbol: string): { at: number; text: string } | null => {
  const at = source.search(new RegExp(`^const ${symbol}\\b`, 'm'))
  if (at === -1) return null
  const next = source.slice(at + 1).search(/^const \w/m)
  const text = next === -1 ? source.slice(at) : source.slice(at, at + 1 + next)
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

const refusalsIn = (body: string, known: Record<string, string>) => {
  const refusals: Refusal[] = []
  const add = (said: string, sure: boolean) => {
    if (!refusals.some((r) => r.said === said)) refusals.push({ said, sure })
  }
  for (const found of body.matchAll(/refuse\(\s*(?:'([^']*)'|`([^`${]*)`|([A-Za-z_$][\w$]*))/g)) {
    const [, quoted, backticked, named] = found
    if (quoted !== undefined || backticked !== undefined)
      add((quoted ?? backticked) as string, true)
    else if (named === 'connectFirst') continue
    else if (named && known[named]) add(known[named], true)
    else add('whatever went wrong underneath, in its own words', false)
  }
  if (/refuse\(\s*`[^`]*\$\{/.test(body)) add('a message naming the file or the jump', false)
  for (const found of body.matchAll(/connectFirst\(\s*(?:'([^']*)')?\s*\)/g))
    add(`Connect the storage first${found[1] ? ` — ${found[1]}` : ''}.`, true)
  if (/\brefuseBusy\(\)/.test(body))
    add('Something is being processed — wait for it to finish.', true)
  if (/\brefuseFrozen\(\)/.test(body) && known.EDIT_LOCKED) add(known.EDIT_LOCKED, true)
  return refusals
}

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

const mapOfTheBoard = ({
  args,
  api,
  sourceOf,
  known
}: {
  args: string
  api: string
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

export { firstSentence, groupedByRule, mapOfTheBoard, sharedRefusals }
export type { BoardMap, MappedIntent, Refusal }
