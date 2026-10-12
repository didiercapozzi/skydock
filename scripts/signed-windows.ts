import * as fs from 'node:fs'
import * as path from 'node:path'
import { buildBlockMap } from 'app-builder-lib/out/targets/blockmap/blockmap'

const installers = path.resolve(process.argv[2] ?? path.join('build', 'installers'))
const signed = path.resolve(process.argv[3] ?? path.join('build', 'signed'))

const placed = fs
  .readdirSync(signed)
  .filter((name) => /\.(exe|msi)$/i.test(name))
  .map((name) => {
    fs.copyFileSync(path.join(signed, name), path.join(installers, name))
    return name
  })
if (placed.length === 0) throw new Error(`nothing signed came back in ${signed}`)

const facts = new Map<string, { sha512: string; size: number }>()
for (const name of placed.filter((one) => one.toLowerCase().endsWith('.exe'))) {
  const file = path.join(installers, name)
  const told = await buildBlockMap(file, 'gzip', `${file}.blockmap`)
  facts.set(name.replace(/ /g, '-'), { sha512: told.sha512, size: fs.statSync(file).size })
}

const listing = path.join(installers, 'latest.yml')
if (fs.existsSync(listing)) {
  let current: string | null = null
  const lines = fs
    .readFileSync(listing, 'utf-8')
    .split('\n')
    .map((line) => {
      const named = /^\s*(?:-\s+)?(?:url|path):\s*(.+?)\s*$/.exec(line)
      if (named) current = named[1].replace(/^['"]|['"]$/g, '')
      const fact = current ? facts.get(current) : undefined
      if (!fact) return line
      const field = /^(\s*)(sha512|size):/.exec(line)
      if (!field) return line
      return `${field[1]}${field[2]}: ${field[2] === 'size' ? fact.size : fact.sha512}`
    })
  fs.writeFileSync(listing, lines.join('\n'))
}

for (const name of placed) console.log(`[SkyDock] signed ${name}`)
